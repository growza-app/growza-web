#!/usr/bin/env python3
"""
Growza Jira Integration CLI Helper
"""
import sys
import os
import base64
import json
import subprocess
import urllib.request
import urllib.parse

JIRA_BASE_URL = os.environ.get("JIRA_BASE_URL", "https://growza.atlassian.net")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "growza.app@gmail.com")

# The token is a secret, so it lives in the macOS Keychain and never in this file. It used to sit here as a
# literal, which meant one `git add -A` away from being published, and a copy in every .pyc beside it.
#
# Put it there once, after creating it at
# https://id.atlassian.com/manage-profile/security/api-tokens:
#
#     security add-generic-password -U -a "$USER" -s growza-jira -w
#
# (-w with no value prompts, so the token is never typed into a shell command and never reaches history.)
# JIRA_API_TOKEN in the environment wins when it is set, for CI or a one-off run.
KEYCHAIN_SERVICE = "growza-jira"


def _token():
    env = os.environ.get("JIRA_API_TOKEN")
    if env:
        return env
    try:
        found = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            check=True,
        )
        return found.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        sys.exit(
            f"No Jira token. Create one at https://id.atlassian.com/manage-profile/security/api-tokens, then:\n"
            f"  security add-generic-password -U -a \"$USER\" -s {KEYCHAIN_SERVICE} -w\n"
            f"Or set JIRA_API_TOKEN for this run."
        )


def _request(path, method="GET", body=None):
    url = f"{JIRA_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    auth = base64.b64encode(f"{JIRA_EMAIL}:{_token()}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def _adf_to_text(node):
    if not node or not isinstance(node, dict):
        return ""
    node_type = node.get("type")
    text = node.get("text", "")
    content = node.get("content", [])
    sub = "".join(_adf_to_text(c) for c in content)
    
    if node_type == "paragraph":
        return f"{sub}\n"
    elif node_type == "heading":
        level = node.get("attrs", {}).get("level", 2)
        return f"{'#' * level} {sub}\n"
    elif node_type == "bulletList":
        return f"{sub}\n"
    elif node_type == "listItem":
        return f"* {sub}"
    elif node_type == "codeBlock":
        return f"```\n{sub}```\n"
    return text + sub

def get_issue(key):
    data = _request(f"/rest/api/3/issue/{key}")
    fields = data.get("fields", {})
    print(f"🎫 {data.get('key')}: {fields.get('summary')}")
    print(f"   Status:      {fields.get('status', {}).get('name')}")
    print(f"   Issue Type:  {fields.get('issuetype', {}).get('name')}")
    print(f"   Priority:    {fields.get('priority', {}).get('name')}")
    assignee = fields.get("assignee")
    print(f"   Assignee:    {assignee.get('displayName') if assignee else 'Unassigned'}")
    
    desc_node = fields.get("description")
    if desc_node:
        print("\n--- Description ---")
        print(_adf_to_text(desc_node).strip())
    
    comments = fields.get("comment", {}).get("comments", [])
    if comments:
        print(f"\n--- Comments ({len(comments)}) ---")
        for c in comments[-3:]:
            author = c.get("author", {}).get("displayName", "User")
            created = c.get("created", "")[:10]
            body = _adf_to_text(c.get("body"))
            print(f"[{created}] {author}: {body.strip()}")

def search_issues(jql, max_results=10):
    payload = {
        "jql": jql,
        "maxResults": max_results,
        "fields": ["summary", "status", "issuetype", "priority", "assignee"]
    }
    data = _request("/rest/api/3/search/jql", method="POST", body=payload)
    issues = data.get("issues", [])
    print(f"Found {len(issues)} issues:")
    for i in issues:
        fields = i.get("fields", {})
        status = fields.get("status", {}).get("name", "Unknown")
        summary = fields.get("summary", "")
        # /search/jql returns key in data or issue id
        key = i.get("key") or i.get("id")
        print(f"- {key:<10} [{status:<12}] {summary}")

def recent_issues(project="GRW"):
    jql = f"project = {project} ORDER BY updated DESC"
    search_issues(jql, max_results=8)

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  jira.py get <ISSUE-KEY>")
        print("  jira.py search <JQL>")
        print("  jira.py recent [PROJECT]")
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    if cmd == "get" and len(sys.argv) >= 3:
        get_issue(sys.argv[2])
    elif cmd == "search" and len(sys.argv) >= 3:
        search_issues(" ".join(sys.argv[2:]))
    elif cmd == "recent":
        proj = sys.argv[2] if len(sys.argv) >= 3 else "GRW"
        recent_issues(proj)
    else:
        print(f"Unknown command or missing arguments: {cmd}")

if __name__ == "__main__":
    main()
