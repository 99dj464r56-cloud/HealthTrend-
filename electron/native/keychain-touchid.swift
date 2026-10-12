/**
 * HealthTrend Keychain helper.
 *
 * Stores the 32-byte data key as a generic password with
 * kSecAttrAccessibleWhenUnlockedThisDeviceOnly (device-bound, not iCloud-synced).
 *
 * Touch ID is enforced by the Electron main process via systemPreferences.promptTouchID
 * BEFORE every store/load. We intentionally do NOT attach a SecAccessControl biometry ACL:
 * that requires Apple Developer signing entitlements; without them macOS returns
 * errSecMissingEntitlement (-34018) and never shows Touch ID. Electron safeStorage is also
 * avoided — it creates a "HealthTrend Safe Storage" item that prompts for the login
 * keychain password instead of Touch ID.
 *
 * Usage: available | store <service> <account> <b64> | load <service> <account> | delete <service> <account>
 */
import Foundation
import LocalAuthentication
import Security

enum CmdError: Error { case usage, badData, status(OSStatus) }

func deleteItem(service: String, account: String) {
  SecItemDelete([
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
  ] as CFDictionary)
}

func store(service: String, account: String, rawB64: String) throws {
  guard let data = Data(base64Encoded: rawB64), data.count == 32 else { throw CmdError.badData }
  deleteItem(service: service, account: account)
  let status = SecItemAdd([
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecAttrLabel as String: "HealthTrend Touch ID key",
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    kSecValueData as String: data,
  ] as CFDictionary, nil)
  if status != errSecSuccess { throw CmdError.status(status) }
}

func load(service: String, account: String) throws -> String {
  var out: AnyObject?
  let status = SecItemCopyMatching([
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecReturnData as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ] as CFDictionary, &out)
  if status != errSecSuccess { throw CmdError.status(status) }
  guard let data = out as? Data, data.count == 32 else { throw CmdError.badData }
  return data.base64EncodedString()
}

func available() -> Bool {
  let ctx = LAContext()
  var err: NSError?
  return ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
}

let args = CommandLine.arguments
guard args.count >= 2 else { fputs("usage\n", stderr); exit(2) }
do {
  switch args[1] {
  case "available": print(available() ? "1" : "0")
  case "store":
    guard args.count >= 5 else { throw CmdError.usage }
    try store(service: args[2], account: args[3], rawB64: args[4])
  case "load":
    guard args.count >= 4 else { throw CmdError.usage }
    print(try load(service: args[2], account: args[3]))
  case "delete":
    guard args.count >= 4 else { throw CmdError.usage }
    deleteItem(service: args[2], account: args[3])
  default: throw CmdError.usage
  }
} catch CmdError.usage { fputs("usage\n", stderr); exit(2)
} catch CmdError.badData { fputs("bad data\n", stderr); exit(3)
} catch CmdError.status(let s) { fputs("keychain status \(s)\n", stderr); exit(Int32(abs(Int(s)) % 125 + 10))
} catch { fputs("\(error)\n", stderr); exit(1) }
