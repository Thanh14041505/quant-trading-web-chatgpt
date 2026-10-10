from getpass import getpass


def main() -> None:
    print("VNStock API key setup. The key is entered locally and is not sent to the web app.")
    key = getpass("Paste your VNStock API key (input hidden): ").strip()
    if not key:
        raise SystemExit("No key entered; nothing changed.")

    from vnstock.core.utils.auth import change_api_key, check_status

    change_api_key(key)
    print("\nVNStock credential status:")
    check_status()  # VNStock masks the key in its status output.
    print("\nDone. The credential is stored by the VNStock Python library on this computer.")


if __name__ == "__main__":
    main()
