#!/usr/bin/env bash
# Print this machine's private LAN IPv4 addresses, comma-separated (no Docker bridge networks).
hostname -I 2>/dev/null | tr ' ' '\n' \
  | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' \
  | grep -vE '^172\.17\.' \
  | paste -sd, -
