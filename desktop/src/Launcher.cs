// LOFTER Lite 桌面启动器（Windows，WinForms，零依赖：用系统自带 csc.exe 编译）
// 编译：desktop\build.ps1  →  desktop\LOFTER-Lite-Launcher.exe
// 说明：目标 .NET Framework 4.x 的 C# 5 语法（不要用字符串内插 / ?. / nameof 等新语法）
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace LofterLiteLauncher
{
    /// <summary>包一层 server.js 子进程：启动、读日志、探测就绪、停止。</summary>
    public class ServerHost
    {
        public event Action<string> Log;

        private Process _proc;
        private string _repoRoot;
        private string _nodeExe;

        public string Url { get; private set; }
        public bool Running { get { return _proc != null && !_proc.HasExited; } }
        public int Pid { get { return _proc != null && !_proc.HasExited ? _proc.Id : 0; } }

        public ServerHost(string repoRoot, string nodeExe)
        {
            _repoRoot = repoRoot;
            _nodeExe = nodeExe;
        }

        public void Start(bool mock, bool lan, bool watch, int port)
        {
            if (Running) throw new InvalidOperationException("服务已经在运行");

            Url = "http://127.0.0.1:" + port + "/";

            // 注意：不要用 ProcessStartInfo.EnvironmentVariables 注入环境变量。
            // 本机环境里同时有 NO_PROXY 和 no_proxy，.NET Framework 一访问这个属性就抛
            // ArgumentException（"已添加项。字典中的关键字:NO_PROXY 正在添加的关键字:no_proxy"）。
            // 所以改成在 cmd 里先 set 再起 node，效果一样。
            List<string> parts = new List<string>();
            parts.Add("set PORT=" + port);
            parts.Add("set HOST=" + (lan ? "0.0.0.0" : "127.0.0.1"));
            if (mock) parts.Add("set LOFTER_LITE_MOCK=1");
            parts.Add("\"" + _nodeExe + "\"" + (watch ? " --watch server.js" : " server.js"));

            string comspec = Environment.GetEnvironmentVariable("COMSPEC");
            if (string.IsNullOrEmpty(comspec)) comspec = "cmd.exe";

            ProcessStartInfo psi = new ProcessStartInfo(comspec, "/c " + string.Join("&&", parts.ToArray()));
            psi.WorkingDirectory = _repoRoot;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;

            _proc = new Process();
            _proc.StartInfo = psi;
            _proc.EnableRaisingEvents = true;
            _proc.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) Emit(e.Data); };
            _proc.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (e.Data != null) Emit(e.Data); };
            _proc.Exited += delegate { Emit("[进程已退出]"); };
            _proc.Start();
            _proc.BeginOutputReadLine();
            _proc.BeginErrorReadLine();
        }

        /// <summary>轮询 /api/ping，最多等 timeoutMs 毫秒。</summary>
        public bool WaitReady(int timeoutMs)
        {
            Stopwatch sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < timeoutMs)
            {
                if (!Running) return false;
                if (Ping(Url + "api/ping")) return true;
                Thread.Sleep(250);
            }
            return false;
        }

        public static bool Ping(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 1500;
                req.ReadWriteTimeout = 1500;
                req.Proxy = null;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return (int)res.StatusCode == 200;
                }
            }
            catch
            {
                return false;
            }
        }

        public void Stop()
        {
            if (_proc == null) return;
            int pid = 0;
            try { if (!_proc.HasExited) pid = _proc.Id; }
            catch { }

            // 我们是 cmd → node（--watch 时还会再套一层 node），只 Kill 父进程会留下孤儿端口，
            // 所以用 taskkill /T 整棵树一起结束。
            if (pid > 0) KillTree(pid);
            try
            {
                if (!_proc.HasExited) _proc.Kill();
            }
            catch { }
        }

        private static void KillTree(int pid)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                using (Process p = Process.Start(psi))
                {
                    if (p != null)
                    {
                        p.StandardOutput.ReadToEnd();
                        p.StandardError.ReadToEnd();
                        p.WaitForExit(5000);
                    }
                }
            }
            catch { }
        }

        private void Emit(string line)
        {
            Action<string> h = Log;
            if (h != null) h(line);
        }
    }

    public class LauncherForm : Form
    {
        private readonly string _repoRoot;
        private readonly string _nodeExe;
        private readonly string _settingsPath;
        private readonly ServerHost _host;

        private RadioButton _rdoMock;
        private RadioButton _rdoLive;
        private CheckBox _chkLan;
        private CheckBox _chkWatch;
        private CheckBox _chkAuto;
        private NumericUpDown _numPort;
        private Button _btnStart;
        private Button _btnStop;
        private Button _btnOpen;
        private Button _btnClear;
        private Label _lblState;
        private TextBox _txtLog;

        public LauncherForm(string repoRoot, string nodeExe, string settingsPath)
        {
            _repoRoot = repoRoot;
            _nodeExe = nodeExe;
            _settingsPath = settingsPath;
            _host = new ServerHost(repoRoot, nodeExe);
            _host.Log += delegate(string line) { AppendLog(line); };

            BuildUi();
            LoadSettings();
            UpdateButtons();
            AppendLog("[就绪] 服务根目录: " + repoRoot);
            if (nodeExe.IndexOf(Path.DirectorySeparatorChar) < 0)
                AppendLog("[提示] 未找到 node.exe 绝对路径，将交给系统 PATH 解析");
        }

        // ---------------- 界面 ----------------
        private void BuildUi()
        {
            Text = "LOFTER Lite 测试端";
            Font = new Font("Microsoft YaHei UI", 9f);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(760, 560);
            MinimumSize = new Size(680, 480);
            BackColor = Color.FromArgb(246, 247, 249);

            Panel top = new Panel();
            top.Dock = DockStyle.Top;
            top.Height = 132;
            top.Padding = new Padding(12, 10, 12, 4);

            GroupBox box = new GroupBox();
            box.Text = "启动选项";
            box.Dock = DockStyle.Fill;
            top.Controls.Add(box);

            _rdoMock = new RadioButton();
            _rdoMock.Text = "Mock 假数据（离线）";
            _rdoMock.Location = new Point(14, 24);
            _rdoMock.AutoSize = true;
            _rdoMock.Checked = true;

            _rdoLive = new RadioButton();
            _rdoLive.Text = "真实 LOFTER 上游";
            _rdoLive.Location = new Point(174, 24);
            _rdoLive.AutoSize = true;

            _chkLan = new CheckBox();
            _chkLan.Text = "局域网可访问（手机同 WiFi 打开）";
            _chkLan.Location = new Point(330, 24);
            _chkLan.AutoSize = true;

            _chkWatch = new CheckBox();
            _chkWatch.Text = "改文件自动重启";
            _chkWatch.Location = new Point(566, 24);
            _chkWatch.AutoSize = true;

            _chkAuto = new CheckBox();
            _chkAuto.Text = "启动后自动打开浏览器";
            _chkAuto.Location = new Point(566, 56);
            _chkAuto.AutoSize = true;
            _chkAuto.Checked = true;

            Label lblPort = new Label();
            lblPort.Text = "端口";
            lblPort.Location = new Point(14, 56);
            lblPort.AutoSize = true;

            _numPort = new NumericUpDown();
            _numPort.Minimum = 1;
            _numPort.Maximum = 65535;
            _numPort.Value = 8787;
            _numPort.Location = new Point(52, 52);
            _numPort.Width = 78;
            _numPort.Font = new Font("Consolas", 9.5f);

            _btnStart = MakeButton("启动", 148, 48);
            _btnStart.Click += delegate { OnStart(); };

            _btnStop = MakeButton("停止", 244, 48);
            _btnStop.Click += delegate { OnStop(); };

            _btnOpen = MakeButton("打开浏览器", 340, 48);
            _btnOpen.Width = 100;
            _btnOpen.Click += delegate { OpenBrowser(); };

            _btnClear = MakeButton("清缓存", 452, 48);
            _btnClear.Width = 84;
            _btnClear.Click += delegate { ClearCache(); };

            box.Controls.AddRange(new Control[] {
                _rdoMock, _rdoLive, _chkLan, _chkWatch, _chkAuto, lblPort, _numPort,
                _btnStart, _btnStop, _btnOpen, _btnClear
            });

            // 回车 = 启动，Esc = 停止，键盘党不用摸鼠标
            AcceptButton = _btnStart;
            CancelButton = _btnStop;

            Panel statePanel = new Panel();
            statePanel.Dock = DockStyle.Top;
            statePanel.Height = 34;
            statePanel.Padding = new Padding(16, 6, 16, 0);

            _lblState = new Label();
            _lblState.Text = "未运行";
            _lblState.Dock = DockStyle.Fill;
            _lblState.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
            _lblState.ForeColor = Color.FromArgb(120, 120, 130);
            statePanel.Controls.Add(_lblState);

            Panel logPanel = new Panel();
            logPanel.Dock = DockStyle.Fill;
            logPanel.Padding = new Padding(12, 6, 12, 12);

            _txtLog = new TextBox();
            _txtLog.Multiline = true;
            _txtLog.ReadOnly = true;
            _txtLog.ScrollBars = ScrollBars.Vertical;
            _txtLog.WordWrap = true;
            _txtLog.Dock = DockStyle.Fill;
            _txtLog.BackColor = Color.FromArgb(30, 32, 36);
            _txtLog.ForeColor = Color.FromArgb(226, 228, 232);
            _txtLog.Font = new Font("Consolas", 9f);
            _txtLog.BorderStyle = BorderStyle.None;
            logPanel.Controls.Add(_txtLog);

            Controls.Add(logPanel);
            Controls.Add(statePanel);
            Controls.Add(top);

            FormClosing += delegate { _host.Stop(); SaveSettings(); };
            Shown += delegate { AppendLog("[提示] 改完代码点「启动」即可；日志会实时打印在这里。"); };
        }

        private Button MakeButton(string text, int x, int y)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = new Point(x, y);
            b.Size = new Size(88, 32);
            b.FlatStyle = FlatStyle.System;
            return b;
        }

        private void UpdateButtons()
        {
            bool running = _host.Running;
            _btnStart.Enabled = !running;
            _btnStop.Enabled = running;
            _btnOpen.Enabled = running;
            _rdoMock.Enabled = !running;
            _rdoLive.Enabled = !running;
            _chkLan.Enabled = !running;
            _chkWatch.Enabled = !running;
            _numPort.Enabled = !running;
        }

        private void SetState(string text, Color color)
        {
            _lblState.Text = text;
            _lblState.ForeColor = color;
        }

        private void AppendLog(string line)
        {
            if (InvokeRequired)
            {
                try { BeginInvoke(new Action<string>(AppendLog), new object[] { line }); }
                catch { }
                return;
            }
            if (_txtLog.TextLength > 400000) _txtLog.Clear();
            _txtLog.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + line + Environment.NewLine);
        }

        // ---------------- 操作 ----------------
        private void OnStart()
        {
            int port = (int)_numPort.Value;
            bool mock = _rdoMock.Checked;
            bool lan = _chkLan.Checked;
            bool watch = _chkWatch.Checked;

            SetState("启动中…", Color.FromArgb(190, 140, 20));
            AppendLog("—— 启动 " + (mock ? "mock（本地假数据）" : "live（真实上游）") + "，端口 " + port + (lan ? "，局域网可访问" : "") + " ——");

            try
            {
                _host.Start(mock, lan, watch, port);
            }
            catch (Exception ex)
            {
                AppendLog("[错误] 启动失败: " + ex.Message);
                SetState("启动失败", Color.FromArgb(190, 60, 60));
                UpdateButtons();
                return;
            }

            SaveSettings();
            UpdateButtons();

            Thread t = new Thread(delegate()
            {
                bool ok = _host.WaitReady(30000);
                try
                {
                    BeginInvoke((Action)delegate
                    {
                        if (ok && _host.Running)
                        {
                            SetState("运行中  " + _host.Url + "   (PID " + _host.Pid + ")", Color.FromArgb(40, 140, 80));
                            _btnOpen.Enabled = true;
                            AppendLog("[就绪] 打开 " + _host.Url);
                            if (_chkAuto.Checked) OpenBrowser();
                        }
                        else
                        {
                            bool alive = _host.Running;
                            if (alive) _host.Stop();
                            SetState(alive ? "启动超时（看日志）" : "启动失败（看日志）", Color.FromArgb(190, 60, 60));
                            AppendLog("[错误] 服务没有就绪：端口可能被占用，换一个端口再试");
                            UpdateButtons();
                        }
                    });
                }
                catch { }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void OnStop()
        {
            _host.Stop();
            AppendLog("—— 已停止 ——");
            SetState("未运行", Color.FromArgb(120, 120, 130));
            UpdateButtons();
        }

        private void OpenBrowser()
        {
            if (!_host.Running) return;
            try { Process.Start(_host.Url); }
            catch (Exception ex) { AppendLog("[错误] 打不开浏览器: " + ex.Message); }
        }

        private void ClearCache()
        {
            AppendLog("—— 清理缓存 ——");
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(_nodeExe, "scripts/cache-clear.mjs");
                psi.WorkingDirectory = _repoRoot;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.StandardErrorEncoding = Encoding.UTF8;
                using (Process p = Process.Start(psi))
                {
                    string outText = p.StandardOutput.ReadToEnd();
                    string errText = p.StandardError.ReadToEnd();
                    p.WaitForExit(15000);
                    if (outText.Trim().Length > 0) AppendLog(outText.Trim());
                    if (errText.Trim().Length > 0) AppendLog("[错误] " + errText.Trim());
                }
            }
            catch (Exception ex)
            {
                AppendLog("[错误] 清理失败: " + ex.Message);
            }
        }

        // ---------------- 设置 ----------------
        private void LoadSettings()
        {
            try
            {
                if (!File.Exists(_settingsPath)) return;
                foreach (string raw in File.ReadAllLines(_settingsPath))
                {
                    string line = raw.Trim();
                    if (line.Length == 0 || line.StartsWith("#")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string k = line.Substring(0, eq).Trim();
                    string v = line.Substring(eq + 1).Trim();
                    if (k == "port") { int p; if (int.TryParse(v, out p) && p >= 1 && p <= 65535) _numPort.Value = p; }
                    else if (k == "mock") _rdoMock.Checked = v == "1";
                    else if (k == "lan") _chkLan.Checked = v == "1";
                    else if (k == "watch") _chkWatch.Checked = v == "1";
                    else if (k == "autoopen") _chkAuto.Checked = v == "1";
                }
                if (!_rdoMock.Checked) _rdoLive.Checked = true;
            }
            catch { }
        }

        private void SaveSettings()
        {
            try
            {
                string dir = Path.GetDirectoryName(_settingsPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                List<string> lines = new List<string>();
                lines.Add("# LOFTER Lite 桌面启动器设置（删掉即恢复默认）");
                lines.Add("port=" + ((int)_numPort.Value).ToString());
                lines.Add("mock=" + (_rdoMock.Checked ? "1" : "0"));
                lines.Add("lan=" + (_chkLan.Checked ? "1" : "0"));
                lines.Add("watch=" + (_chkWatch.Checked ? "1" : "0"));
                lines.Add("autoopen=" + (_chkAuto.Checked ? "1" : "0"));
                File.WriteAllLines(_settingsPath, lines.ToArray(), new UTF8Encoding(false));
            }
            catch { }
        }
    }

    public static class Program
    {
        private static string _repoRoot;
        private static string _nodeExe;

        [STAThread]
        public static int Main(string[] args)
        {
            // winexe 没有控制台，Console.OutputEncoding 设不动；直接换掉标准输出编码为 UTF-8，
            // 否则在 PowerShell 里看中文是乱码。
            try
            {
                Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
                Console.SetError(new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true });
            }
            catch { }

            _repoRoot = FindRepoRoot();
            _nodeExe = FindNode();

            if (Has(args, "--self-test")) return SelfTest();
            if (Has(args, "--headless")) return RunHeadless(args);

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm(_repoRoot, _nodeExe, SettingsPath()));
            return 0;
        }

        private static string SettingsPath()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LOFTER-Lite");
            return Path.Combine(dir, "launcher.ini");
        }

        /// <summary>从 exe 所在目录往上找 server.js，这样 exe 放哪一层都能用。</summary>
        private static string FindRepoRoot()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            for (int i = 0; i < 8 && !string.IsNullOrEmpty(dir); i++)
            {
                if (File.Exists(Path.Combine(dir, "server.js"))) return dir;
                DirectoryInfo parent = Directory.GetParent(dir);
                if (parent == null) break;
                dir = parent.FullName;
            }
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private static string FindNode()
        {
            string pathVar = Environment.GetEnvironmentVariable("PATH");
            if (pathVar != null)
            {
                foreach (string raw in pathVar.Split(';'))
                {
                    string dir = raw.Trim().Trim('"');
                    if (dir.Length == 0) continue;
                    try
                    {
                        string exe = Path.Combine(dir, "node.exe");
                        if (File.Exists(exe)) return exe;
                    }
                    catch { }
                }
            }
            string[] common = new string[] {
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe"
            };
            foreach (string p in common) if (File.Exists(p)) return p;
            return "node";
        }

        private static bool Has(string[] args, string name)
        {
            foreach (string a in args) if (string.Equals(a, name, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        private static int IntArg(string[] args, string name, int fallback)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                {
                    int v;
                    if (int.TryParse(args[i + 1], out v) && v >= 1 && v <= 65535) return v;
                }
            }
            return fallback;
        }

        private static int FreePort()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        /// <summary>无界面自检：随机端口起 mock 服务，ping 通、拿到首页、再关掉。</summary>
        private static int SelfTest()
        {
            int port = FreePort();
            ServerHost host = new ServerHost(_repoRoot, _nodeExe);
            host.Log += delegate(string line) { Console.WriteLine("  | " + line); };
            Console.WriteLine("仓库根目录: " + _repoRoot);
            Console.WriteLine("node: " + _nodeExe);
            Console.WriteLine("自检端口: " + port);

            bool ok = false;
            try
            {
                host.Start(true, false, false, port);
                ok = host.WaitReady(30000);
                if (ok)
                {
                    ok = ServerHost.Ping(host.Url + "api/ping");
                    Console.WriteLine("  /api/ping => " + (ok ? "OK" : "FAIL"));
                }
                else
                {
                    Console.WriteLine("  服务未就绪");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("  异常: " + ex.Message);
                ok = false;
            }
            finally
            {
                host.Stop();
            }

            Console.WriteLine(ok ? "SELF-TEST OK" : "SELF-TEST FAIL");
            return ok ? 0 : 1;
        }

        /// <summary>无界面运行（给脚本/CI 用）：--headless [--mock] [--lan] [--watch] [--port N]</summary>
        private static int RunHeadless(string[] args)
        {
            bool mock = Has(args, "--mock");
            bool lan = Has(args, "--lan");
            bool watch = Has(args, "--watch");
            int port = IntArg(args, "--port", 8787);

            ServerHost host = new ServerHost(_repoRoot, _nodeExe);
            host.Log += delegate(string line) { Console.WriteLine(line); };
            try
            {
                host.Start(mock, lan, watch, port);
            }
            catch (Exception ex)
            {
                Console.WriteLine("[错误] " + ex.Message);
                return 1;
            }

            if (!host.WaitReady(30000))
            {
                Console.WriteLine("[错误] 服务未就绪");
                host.Stop();
                return 1;
            }
            Console.WriteLine("READY " + host.Url);

            while (host.Running) Thread.Sleep(200);
            return 0;
        }
    }
}
