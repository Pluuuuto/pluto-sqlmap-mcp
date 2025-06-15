#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
// -------- 自动解析 sqlmap 路径 --------
function resolveSqlmapPath(cliPath) {
    if (cliPath && fs.existsSync(cliPath)) {
        console.error(`🔍 使用手动传入的 sqlmap 路径: ${cliPath}`);
        return cliPath;
    }
    try {
        const cmd = os.platform() === "win32" ? "where sqlmap" : "which sqlmap";
        const output = execSync(cmd).toString().split(/\r?\n/)[0].trim();
        if (fs.existsSync(output)) {
            console.error(`🔍 已从环境变量中找到 sqlmap: ${output}`);
            return output;
        }
    }
    catch (e) {
        console.error("❌ 未在系统 PATH 中找到 sqlmap，可执行文件未找到。");
    }
    return null;
}
const args = process.argv.slice(2);
const sqlmapPath = resolveSqlmapPath(args[0]);
if (!sqlmapPath) {
    console.error("❗ 错误：无法定位 sqlmap。请传入路径，或将其加入 PATH 环境变量中。");
    process.exit(1);
}
console.error(`✅ 使用 sqlmap 执行路径：${sqlmapPath}`);
// -------- MCP Server 实例 --------
const server = new McpServer({
    name: "sqlmap",
    version: "1.0.0"
});
server.tool("do-sqlmap", "使用 sqlmap 执行 SQL 注入检测", {
    url: z.string().url().describe("目标 URL"),
    sqlmap_args: z.array(z.string()).optional().describe("附加 sqlmap 参数（如 --batch、--cookie）")
}, async ({ url, sqlmap_args = [] }) => {
    const finalArgs = ["-u", url, ...(sqlmap_args.length ? sqlmap_args : ["--batch"])];
    console.error(`🚀 执行命令：${sqlmapPath} ${finalArgs.join(" ")}`);
    const sqlmap = spawn(sqlmapPath, finalArgs, {
        windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    sqlmap.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        console.error("📤 [stdout]", text.trim());
    });
    sqlmap.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        console.error("📕 [stderr]", text.trim());
    });
    return new Promise((resolve, reject) => {
        sqlmap.on("close", (code) => {
            resolve({
                content: [
                    { type: "text", text: `💡 sqlmap 执行结束，退出码 ${code}` },
                    { type: "text", text: stdout || "(无标准输出)" },
                    ...(stderr ? [{ type: "text", text: "⚠️ 错误输出：\n" + stderr }] : [])
                ]
            });
        });
        sqlmap.on("error", (error) => {
            reject(new Error(`❌ 无法启动 sqlmap：${error.message}`));
        });
    });
});
// -------- 启动 MCP 服务 --------
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ sqlmap MCP Server 已通过 stdio 启动。");
}
main().catch((error) => {
    console.error("💥 主程序运行异常：", error);
    process.exit(1);
});
