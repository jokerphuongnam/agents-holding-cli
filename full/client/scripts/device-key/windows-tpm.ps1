# Windows TPM P-256 device key via the Microsoft Platform Crypto Provider (non-exportable, bound to this TPM).
# usage: powershell -File windows-tpm.ps1 available|pubkey|sign <file>   (base64 output; signature is raw r||s, the server accepts both)
param([string]$Cmd, [string]$File)
$ErrorActionPreference = 'Stop'
$prov = [System.Security.Cryptography.CngProvider]::new('Microsoft Platform Crypto Provider')
$name = 'agents-holding-device-key'
function Get-Key {
  if ([System.Security.Cryptography.CngKey]::Exists($name, $prov)) { return [System.Security.Cryptography.CngKey]::Open($name, $prov) }
  $p = [System.Security.Cryptography.CngKeyCreationParameters]::new(); $p.Provider = $prov
  $p.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
  return [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256, $name, $p)
}
switch ($Cmd) {
  'available' { try { $null = Get-Key; exit 0 } catch { exit 2 } }
  'pubkey' { $e = [System.Security.Cryptography.ECDsaCng]::new((Get-Key)); [Convert]::ToBase64String($e.ExportSubjectPublicKeyInfo()) }
  'sign' { $e = [System.Security.Cryptography.ECDsaCng]::new((Get-Key)); $d = if ($File -and $File -ne '-') { [IO.File]::ReadAllBytes($File) } else { $ms = [IO.MemoryStream]::new(); [Console]::OpenStandardInput().CopyTo($ms); $ms.ToArray() }
           [Convert]::ToBase64String($e.SignData($d, [System.Security.Cryptography.HashAlgorithmName]::SHA256)) }
  default { Write-Error 'usage: windows-tpm.ps1 available|pubkey|sign <file>'; exit 64 }
}
