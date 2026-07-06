import { execFile } from "node:child_process";
import net from "node:net";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 41973;
const WAIT_STEP_MS = 120;
const TERMINATE_TIMEOUT_MS = 2500;

const requestedPort = Number(process.argv[2] ?? process.env.PORT ?? DEFAULT_PORT);

if (!Number.isInteger(requestedPort) || requestedPort <= 0 || requestedPort > 65535) {
  console.error(`Invalid server port: ${process.argv[2] ?? process.env.PORT}`);
  process.exit(1);
}

async function canListen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function waitUntilPortIsFree(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canListen(port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }

  return false;
}

function parseWindowsNetstat(output, port) {
  const pids = new Set();
  const portSuffix = `:${port}`;

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);

    if (columns.length < 5 || columns[0] !== "TCP") {
      continue;
    }

    const [protocol, localAddress, remoteAddress, state, pid] = columns;
    const isListeningState = state === "LISTENING" || remoteAddress === "0.0.0.0:0" || remoteAddress === "[::]:0";

    if (protocol === "TCP" && isListeningState && localAddress.endsWith(portSuffix)) {
      pids.add(Number(pid));
    }
  }

  return [...pids].filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function findWindowsListenerPids(port) {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], {
    windowsHide: true
  });

  return parseWindowsNetstat(stdout, port);
}

async function findUnixListenerPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);

    return stdout
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

async function findListenerPids(port) {
  if (process.platform === "win32") {
    return findWindowsListenerPids(port);
  }

  return findUnixListenerPids(port);
}

function signalProcess(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return true;
    }

    return false;
  }
}

async function terminateListeners(port, pids) {
  if (pids.length === 0) {
    console.error(`Port ${port} is already in use, but no listener PID could be found.`);
    process.exit(1);
  }

  console.log(`Port ${port} is already in use. Stopping stale listener PID(s): ${pids.join(", ")}`);

  for (const pid of pids) {
    signalProcess(pid, "SIGTERM");
  }

  if (await waitUntilPortIsFree(port, TERMINATE_TIMEOUT_MS)) {
    return;
  }

  for (const pid of pids) {
    signalProcess(pid, "SIGKILL");
  }

  if (!(await waitUntilPortIsFree(port, TERMINATE_TIMEOUT_MS))) {
    console.error(`Could not free port ${port}. Stop PID(s) ${pids.join(", ")} manually and try again.`);
    process.exit(1);
  }
}

if (!(await canListen(requestedPort))) {
  await terminateListeners(requestedPort, await findListenerPids(requestedPort));
}
