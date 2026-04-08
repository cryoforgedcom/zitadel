#!/usr/bin/env sh


for env_file in $(find . -maxdepth 1 -type f -iname "*.env" -print | sort); do
 set -a
    echo "Loading environment variables from $env_file"
 # shellcheck disable=SC1090
 . "$env_file"
 set +a
done

$@
