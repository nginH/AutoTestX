import * as os from "os";
import * as pty from "node-pty";
import chalk from "chalk";

export default class P_Terminal {
    public static instance: P_Terminal;

    public static getInstance(): P_Terminal {
        if (!P_Terminal.instance) {
            P_Terminal.instance = new P_Terminal();
        }
        return P_Terminal.instance;
    }

    private shell: string;
    private ptyProcess: pty.IPty;

    constructor() {
        this.shell = os.platform() === "win32" ? "cmd" : os.platform() === "darwin" ? "zsh" : "bash";

        this.ptyProcess = pty.spawn(this.shell, [], {
            name: "xterm-color",
            cols: 80,
            rows: 30,
            cwd: process.cwd(),
            env: process.env
        });

        console.log(chalk.greenBright("[✔] Isolated Terminal Initialized"));
    }

    public Pseudo_Stream(onData: (data: string) => void): void {
        if (this.ptyProcess) {
            this.ptyProcess.onData((data: string) => {
                console.log(chalk.blue("[Terminal Output]"), chalk.white(data));
                onData(data);
            });
        }
    }

    public Pseudo_Write(data: string): void {
        if (this.ptyProcess) {
            console.log(chalk.yellowBright("[✔] Command Executed:"), chalk.magentaBright(data.trim()));
            this.ptyProcess.write(data + "\n");
        }
    }

    public Pseudo_Exit(): void {
        if (this.ptyProcess) {
            console.log(chalk.redBright("[✖] Closing Terminal..."));
            this.ptyProcess.kill();
        }
    }

    public Pseudo_Resize(cols: number, rows: number): void {
        if (this.ptyProcess) {
            console.log(chalk.cyanBright(`[✔] Resizing Terminal: ${cols}x${rows}`));
            this.ptyProcess.resize(cols, rows);
        }
    }
}
