// IExplorerCommand shell extension for Windows 11 top-level context menu.
// Invokes: involvex-term.exe nt -d "<folder>"
// Registered via sparse MSIX (see AppxManifest.xml).
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <new>
#include <string>
#include <vector>

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")

// Must match AppxManifest.com:Class/@Id
static const CLSID CLSID_InvolvexTermExplorerCommand = {
	0xA1B2C3D4,
	0xE5F6,
	0x7890,
	{0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90}};

static HINSTANCE g_hInst = nullptr;
static LONG g_locks = 0;

static std::wstring DllDir() {
	wchar_t path[MAX_PATH] = {};
	GetModuleFileNameW(g_hInst, path, MAX_PATH);
	PathRemoveFileSpecW(path);
	return path;
}

static std::wstring ExePath() {
	return DllDir() + L"\\involvex-term.exe";
}

static HRESULT GetFirstFolder(IShellItemArray* items, std::wstring& out) {
	if (!items) return E_INVALIDARG;
	DWORD count = 0;
	HRESULT hr = items->GetCount(&count);
	if (FAILED(hr) || count == 0) return E_FAIL;
	IShellItem* item = nullptr;
	hr = items->GetItemAt(0, &item);
	if (FAILED(hr) || !item) return E_FAIL;
	PWSTR path = nullptr;
	hr = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
	item->Release();
	if (FAILED(hr) || !path) return E_FAIL;
	out.assign(path);
	CoTaskMemFree(path);
	return S_OK;
}

static HRESULT LaunchAt(const std::wstring& folder) {
	std::wstring exe = ExePath();
	if (GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES)
		return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
	std::wstring args = L"nt -d \"" + folder + L"\"";
	SHELLEXECUTEINFOW sei = {};
	sei.cbSize = sizeof(sei);
	sei.fMask = SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
	sei.lpVerb = L"open";
	sei.lpFile = exe.c_str();
	sei.lpParameters = args.c_str();
	sei.nShow = SW_SHOWNORMAL;
	if (!ShellExecuteExW(&sei))
		return HRESULT_FROM_WIN32(GetLastError());
	return S_OK;
}

class ExplorerCommand : public IExplorerCommand {
public:
	ExplorerCommand() : m_ref(1) { InterlockedIncrement(&g_locks); }
	~ExplorerCommand() { InterlockedDecrement(&g_locks); }

	IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_POINTER;
		*ppv = nullptr;
		if (riid == IID_IUnknown || riid == IID_IExplorerCommand) {
			*ppv = static_cast<IExplorerCommand*>(this);
			AddRef();
			return S_OK;
		}
		return E_NOINTERFACE;
	}
	IFACEMETHODIMP_(ULONG) AddRef() override {
		return InterlockedIncrement(&m_ref);
	}
	IFACEMETHODIMP_(ULONG) Release() override {
		ULONG n = InterlockedDecrement(&m_ref);
		if (!n) delete this;
		return n;
	}

	IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override {
		return SHStrDupW(L"Open in involvex-term", name);
	}
	IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override {
		std::wstring path = ExePath() + L",0";
		return SHStrDupW(path.c_str(), icon);
	}
	IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override {
		return SHStrDupW(L"Open folder in involvex-term", tip);
	}
	IFACEMETHODIMP GetCanonicalName(GUID* guid) override {
		*guid = CLSID_InvolvexTermExplorerCommand;
		return S_OK;
	}
	IFACEMETHODIMP GetState(IShellItemArray*, BOOL, EXPCMDSTATE* state) override {
		*state = ECS_ENABLED;
		return S_OK;
	}
	IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
		std::wstring folder;
		HRESULT hr = GetFirstFolder(items, folder);
		if (FAILED(hr)) {
			// Background click: try current directory from explorer view — fall
			// back to no-op rather than crashing the shell.
			return S_OK;
		}
		return LaunchAt(folder);
	}
	IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
		*flags = ECF_DEFAULT;
		return S_OK;
	}
	IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand**) override {
		return E_NOTIMPL;
	}

private:
	LONG m_ref;
};

class ClassFactory : public IClassFactory {
public:
	ClassFactory() : m_ref(1) { InterlockedIncrement(&g_locks); }
	~ClassFactory() { InterlockedDecrement(&g_locks); }

	IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
		if (!ppv) return E_POINTER;
		*ppv = nullptr;
		if (riid == IID_IUnknown || riid == IID_IClassFactory) {
			*ppv = static_cast<IClassFactory*>(this);
			AddRef();
			return S_OK;
		}
		return E_NOINTERFACE;
	}
	IFACEMETHODIMP_(ULONG) AddRef() override {
		return InterlockedIncrement(&m_ref);
	}
	IFACEMETHODIMP_(ULONG) Release() override {
		ULONG n = InterlockedDecrement(&m_ref);
		if (!n) delete this;
		return n;
	}
	IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
		if (outer) return CLASS_E_NOAGGREGATION;
		ExplorerCommand* cmd = new (std::nothrow) ExplorerCommand();
		if (!cmd) return E_OUTOFMEMORY;
		HRESULT hr = cmd->QueryInterface(riid, ppv);
		cmd->Release();
		return hr;
	}
	IFACEMETHODIMP LockServer(BOOL lock) override {
		if (lock) InterlockedIncrement(&g_locks);
		else InterlockedDecrement(&g_locks);
		return S_OK;
	}

private:
	LONG m_ref;
};

BOOL APIENTRY DllMain(HMODULE h, DWORD reason, LPVOID) {
	if (reason == DLL_PROCESS_ATTACH) {
		g_hInst = h;
		DisableThreadLibraryCalls(h);
	}
	return TRUE;
}

STDAPI DllCanUnloadNow() {
	return g_locks == 0 ? S_OK : S_FALSE;
}

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, void** ppv) {
	if (clsid != CLSID_InvolvexTermExplorerCommand) return CLASS_E_CLASSNOTAVAILABLE;
	ClassFactory* factory = new (std::nothrow) ClassFactory();
	if (!factory) return E_OUTOFMEMORY;
	HRESULT hr = factory->QueryInterface(riid, ppv);
	factory->Release();
	return hr;
}
