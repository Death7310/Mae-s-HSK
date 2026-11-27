#!/usr/bin/env bash
# Signs the built APK. Run from app/:  bash signing/sign-apk.sh <in.apk> <out.apk>
#
# With ANDROID_KEYSTORE_PASSWORD set (a repository secret in CI) the APK is
# signed with the project key, signing/mae-hsk.p12, and the result is checked
# against signing/cert-sha256.txt. Every such build installs over the last one.
#
# Without the password the APK is signed the same way with a key made on the
# spot, so the build still works and this script is still exercised, but that
# APK does not install over other builds.
set -euo pipefail

in=$1
out=$2
here=$(cd "$(dirname "$0")" && pwd)
tools=$(ls -d "${ANDROID_HOME:?ANDROID_HOME is not set}"/build-tools/*/ | sort -V | tail -1)

if [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ]; then
  keystore="$here/mae-hsk.p12"
  alias=mae-hsk
  project_key=1
else
  echo "::warning title=Throw-away signing key::ANDROID_KEYSTORE_PASSWORD is not set, so this APK is signed with a key made for this build only. It will not install over other builds. See README, 'Signing'."
  keystore="$(mktemp -d)/throwaway.p12"
  alias=throwaway
  project_key=0
  export ANDROID_KEYSTORE_PASSWORD="throwaway-$RANDOM-$RANDOM"
  keytool -genkeypair -keystore "$keystore" -storetype PKCS12 \
    -storepass:env ANDROID_KEYSTORE_PASSWORD -alias "$alias" \
    -keyalg RSA -keysize 2048 -validity 30 -dname "CN=throw-away build key"
fi

"${tools}apksigner" sign --ks "$keystore" --ks-type PKCS12 --ks-key-alias "$alias" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD \
  --out "$out" "$in"

certs=$("${tools}apksigner" verify --print-certs "$out")
echo "$certs" | grep 'SHA-256'

if [ "$project_key" = 1 ]; then
  want=$(tr -d ' \n' < "$here/cert-sha256.txt")
  if ! echo "$certs" | grep -qi "SHA-256 digest: $want"; then
    echo "::error::The APK is not signed with the project certificate ($want)."
    exit 1
  fi
  echo "Signed with the project key."
fi
