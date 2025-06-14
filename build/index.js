import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import fs from "fs";
const args = process.argv.slice(2);
// 参数校验与帮助信息
if (args.length === 0 || args.includes("--help")) {
    console.error("❗ 用法: sqlmap-mcp <sqlmap 可执行文件路径或 python3 sqlmap.py>");
    console.error("📌 示例: sqlmap-mcp python3 /path/to/sqlmap.py");
    process.exit(1);
}
if (!fs.existsSync(args[0])) {
    console.error(`❗ 错误: 指定的 sqlmap 执行文件 "${args[0]}" 不存在。`);
    process.exit(1);
}
// 创建 MCP Server 实例
const server = new McpServer({
    name: "sqlmap",
    version: "1.0.0",
});
server.tool("do-sqlmap", "Run sqlmap with specified URL", {
    url: z.string().url().describe("目标 URL，用于检测 SQL 注入"),
    sqlmap_args: z.array(z.string()).describe("附加的 sqlmap 参数，例如 --batch、--dbs、--cookie 等"),
}, async ({ url, sqlmap_args }) => {
    const finalArgs = ['-u', url, ...(sqlmap_args.length ? sqlmap_args : ['--batch'])];
    console.error(`🚀 执行命令: ${args[0]} ${finalArgs.join(" ")}`);
    const sqlmap = spawn(args[0], finalArgs);
    let stdout = "";
    let stderr = "";
    sqlmap.stdout.on("data", (data) => {
        stdout += data.toString();
    });
    sqlmap.stderr.on("data", (data) => {
        stderr += data.toString();
    });
    return new Promise((resolve, reject) => {
        sqlmap.on("close", (code) => {
            if (code === 0) {
                resolve({
                    content: [
                        { type: "text", text: stdout },
                        { type: "text", text: stderr },
                        { type: "text", text: "✅ sqlmap 执行成功。" },
                    ],
                });
            }
            else {
                reject(new Error(`❌ sqlmap 以退出码 ${code} 结束。错误信息:\n${stderr}`));
            }
        });
        sqlmap.on("error", (error) => {
            reject(new Error(`❌ 无法启动 sqlmap：${error.message}`));
        });
    });
});
// 启动服务
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ sqlmap MCP Server 已通过 stdio 启动。");
}
main().catch((error) => {
    console.error("💥 主程序运行错误:", error);
    process.exit(1);
});
