# Davide Solla Photography Apple Wallet Pass Source

This folder is an unsigned Apple Wallet pass template. Its QR barcode opens:

https://www.davidesolla.com/

To turn it into an installable `.pkpass`, replace `passTypeIdentifier` and `teamIdentifier` in `pass.json`, add the Apple WWDR certificate and your Pass Type ID certificate, regenerate `manifest.json`, add the signed `signature` file, then zip the package with your preferred PassKit signing tool.

The designed QR/business-card assets are in:

- `assets/wallet/davide-solla-business-card.svg`
- `assets/wallet/davide-solla-photography-qr.svg`
- `assets/wallet/davide-solla-photography-qr.png`
- `assets/wallet/davide-solla-contact.vcf`
