// Secure Enclave P-256 device key for agents-holding. The private key never leaves the Secure Enclave; only an opaque,
// device-bound blob (useless on any other Mac) is stored at ~/.config/agents-holding/device-key/se.key (0600).
// Usage: ah-device-key pubkey            -> base64 SPKI DER
//        ah-device-key sign <file|->     -> base64 DER ECDSA-SHA256 signature of the bytes
//        ah-device-key available         -> exit 0 if a Secure Enclave exists
import CryptoKit
import Foundation
let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".config/agents-holding/device-key")
let blob = dir.appendingPathComponent("se.key")
func die(_ m: String, _ c: Int32 = 1) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(c) }
func key() -> SecureEnclave.P256.Signing.PrivateKey {
  guard SecureEnclave.isAvailable else { die("no Secure Enclave", 2) }
  if let d = try? Data(contentsOf: blob), let k = try? SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: d) { return k }
  do {
    let k = try SecureEnclave.P256.Signing.PrivateKey()
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    try k.dataRepresentation.write(to: blob, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: blob.path)
    return k
  } catch { die("cannot create Secure Enclave key: \(error)") }
}
let a = CommandLine.arguments
switch a.count > 1 ? a[1] : "" {
case "available": exit(SecureEnclave.isAvailable ? 0 : 2)
case "pubkey": print(key().publicKey.derRepresentation.base64EncodedString())
case "sign":
  let p = a.count > 2 ? a[2] : "-"
  let d = p == "-" ? FileHandle.standardInput.readDataToEndOfFile() : ((try? Data(contentsOf: URL(fileURLWithPath: p))) ?? Data())
  do { print(try key().signature(for: d).derRepresentation.base64EncodedString()) } catch { die("sign failed: \(error)") }
default: die("usage: ah-device-key available|pubkey|sign <file|->", 64)
}
