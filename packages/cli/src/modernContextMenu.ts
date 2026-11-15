// Sparse MSIX registration for the Win11 top-level Explorer menu.
// Classic HKCU verbs stay in contextMenu.ts; this layer is best-effort.
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const SPARSE_PACKAGE_FAMILY = 'dev.involvex.term.explorer'
export const SPARSE_MSIX_NAME = 'InvolvexTermExplorerCommand.msix'
export const SPARSE_DLL_NAME = 'InvolvexTermExplorerCommand.dll'

export interface ModernContextMenuStatus {
	supported: boolean
	installed: boolean
	msixPath: string | null
	dllPath: string | null
	detail: string | null
}

function ps(command: string): {
	status: number | null
	stdout: string
	stderr: string
} {
	try {
		const r = spawnSync(
			'powershell.exe',
			[
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				command,
			],
			{encoding: 'utf8', shell: false},
		)
		return {
			status: r.status,
			stdout: typeof r.stdout === 'string' ? r.stdout : '',
			stderr: typeof r.stderr === 'string' ? r.stderr : '',
		}
	} catch (e) {
		return {
			status: 1,
			stdout: '',
			stderr: e instanceof Error ? e.message : String(e),
		}
	}
}

/** Resolve sparse artifacts next to the app exe (install dir / ExternalLocation). */
export function sparseArtifactPaths(exeDir: string): {
	msixPath: string
	dllPath: string
} {
	return {
		msixPath: path.join(exeDir, SPARSE_MSIX_NAME),
		dllPath: path.join(exeDir, SPARSE_DLL_NAME),
	}
}

export function getModernStatus(
	exeDir: string | null,
	platform: NodeJS.Platform = process.platform,
): ModernContextMenuStatus {
	if (platform !== 'win32') {
		return {
			supported: false,
			installed: false,
			msixPath: null,
			dllPath: null,
			detail: 'Windows-only',
		}
	}
	const paths = exeDir ? sparseArtifactPaths(exeDir) : null
	const msixPath = paths?.msixPath ?? null
	const dllPath = paths?.dllPath ?? null
	const r = ps(
		`Get-AppxPackage -Name '${SPARSE_PACKAGE_FAMILY}' | Select-Object -ExpandProperty PackageFullName`,
	)
	const name = r.stdout.trim()
	const installed = r.status === 0 && name.length > 0
	return {
		supported: true,
		installed,
		msixPath,
		dllPath,
		detail: installed
			? name
			: msixPath && !fs.existsSync(msixPath)
				? 'sparse package not bundled'
				: 'not installed',
	}
}

/**
 * Register the sparse package against `exeDir` as ExternalLocation.
 * Throws on hard failure; callers should catch and keep classic install.
 */
export function installModern(
	exeDir: string,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== 'win32')
		throw new Error('Modern context menu is Windows-only.')
	const {msixPath, dllPath} = sparseArtifactPaths(exeDir)
	if (!fs.existsSync(msixPath)) {
		throw new Error(
			`Sparse package missing: ${msixPath}. Build with bun scripts/build-explorer-command.mjs`,
		)
	}
	if (!fs.existsSync(dllPath)) {
		throw new Error(`Explorer command DLL missing: ${dllPath}`)
	}
	// Remove any previous registration so ExternalLocation can be retargeted.
	try {
		uninstallModern(platform)
	} catch {
		/* ignore */
	}
	const escapedMsix = msixPath.replace(/'/g, "''")
	const escapedDir = exeDir.replace(/'/g, "''")
	const r = ps(
		`Add-AppxPackage -Path '${escapedMsix}' -ExternalLocation '${escapedDir}' -ErrorAction Stop`,
	)
	if (r.status !== 0) {
		const msg = (r.stderr || r.stdout || 'Add-AppxPackage failed').trim()
		throw new Error(
			`${msg} (unsigned packages need Developer Mode or a trusted signing cert)`,
		)
	}
}

export function uninstallModern(
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== 'win32')
		throw new Error('Modern context menu is Windows-only.')
	const r = ps(
		`$p = Get-AppxPackage -Name '${SPARSE_PACKAGE_FAMILY}'; if ($p) { Remove-AppxPackage -Package $p.PackageFullName }`,
	)
	if (r.status !== 0) {
		throw new Error(
			(r.stderr || r.stdout || 'Remove-AppxPackage failed').trim(),
		)
	}
}
