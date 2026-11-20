import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./config";
export async function quietRconLogging(data: string) {
  const path = join(data, "log4j2.xml");
  let xml = (await exists(path))
    ? await readFile(path, "utf8")
    : `<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN" monitorInterval="30">
 <Appenders>
  <Console name="SysOut" target="SYSTEM_OUT"><PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg%n"/></Console>
  <RollingRandomAccessFile name="File" fileName="logs/latest.log" filePattern="logs/%d{yyyy-MM-dd}-%i.log.gz"><PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg%n"/><Policies><TimeBasedTriggeringPolicy/><OnStartupTriggeringPolicy/></Policies><DefaultRolloverStrategy max="14"/></RollingRandomAccessFile>
 </Appenders>
 <Loggers><Root level="info"><AppenderRef ref="SysOut"/><AppenderRef ref="File"/></Root></Loggers>
</Configuration>\n`;
  if (xml.includes("mc-helper RCON housekeeping")) return;
  if (!/<Loggers\s*>/.test(xml))
    throw Error("Custom log4j configuration needs operator review");
  const loggers = [
    "net.minecraft.server.rcon.thread.RconClient",
    "net.minecraft.server.rcon.thread.GenericThread",
  ];
  const insert = loggers
    .filter((name) => !xml.includes('name="' + name + '"'))
    .map((name) => `<Logger name="${name}" level="warn"/>`)
    .join("\n");
  xml = xml.replace(
    /<Loggers\s*>/,
    "<Loggers>\n<!-- mc-helper RCON housekeeping: preserve warnings/errors -->\n" +
      insert +
      "\n",
  );
  await writeFile(path + ".mc-new", xml, { mode: 0o600 });
  await rename(path + ".mc-new", path);
}
