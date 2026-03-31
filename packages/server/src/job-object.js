import { execFileSync } from "node:child_process";
import { platform } from "node:os";

export const isSupported = platform() === "win32";

const JOB_OBJECT_CS = `
using System;
using System.Runtime.InteropServices;
public class JobObject {
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr CreateJobObject(IntPtr attr, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")]
  static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [StructLayout(LayoutKind.Sequential)]
  struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public int LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public int ActiveProcessLimit;
    public long Affinity;
    public int PriorityClass;
    public int SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct IO_COUNTERS {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }
  public static string Create() {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) return "0";
    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    info.BasicLimitInformation.LimitFlags = 0x2000;
    SetInformationJobObject(job, 9, ref info, Marshal.SizeOf(info));
    return job.ToInt64().ToString();
  }
  public static void Assign(string jobHandle, int pid) {
    IntPtr job = new IntPtr(long.Parse(jobHandle));
    IntPtr proc = OpenProcess(0x1F0FFF, false, pid);
    if (proc != IntPtr.Zero) {
      AssignProcessToJobObject(job, proc);
      CloseHandle(proc);
    }
  }
  public static void Close(string jobHandle) {
    IntPtr job = new IntPtr(long.Parse(jobHandle));
    CloseHandle(job);
  }
}`;

function runPS(command) {
	return execFileSync(
		"powershell",
		[
			"-NoProfile",
			"-Command",
			`Add-Type -Language CSharp @"\n${JOB_OBJECT_CS}\n"@; ${command}`,
		],
		{ timeout: 10000, encoding: "utf-8" },
	);
}

export function createJobObject() {
	if (!isSupported) return null;
	const result = runPS("[JobObject]::Create()");
	return result.trim();
}

export function assignToJob(jobHandle, pid) {
	if (!isSupported || !jobHandle) return;
	runPS(`[JobObject]::Assign('${jobHandle}', ${pid})`);
}

export function closeJobObject(jobHandle) {
	if (!isSupported || !jobHandle) return;
	try {
		runPS(`[JobObject]::Close('${jobHandle}')`);
	} catch {
		// Best-effort — process may already be dead
	}
}
