function sedInPlace(expr: string, file: string): string {
  return `if [[ \"$(uname)\" == \"Darwin\" ]]; then sudo sed -i '' '${expr}' ${file}; else sudo sed -i '${expr}' ${file}; fi`;
}

export function generateSSHHardeningScript(): string {
  return `#!/bin/bash
# OverClaw SSH Hardening Script
set -e

if [[ "$(uname)" == "Darwin" ]]; then
  SSHD_CONFIG="/etc/ssh/sshd_config"
  RESTART_CMD="sudo launchctl stop com.openssh.sshd || true; sudo launchctl start com.openssh.sshd || true"
else
  SSHD_CONFIG="/etc/ssh/sshd_config"
  RESTART_CMD="if command -v systemctl &> /dev/null; then sudo systemctl restart sshd || sudo systemctl restart ssh; elif command -v service &> /dev/null; then sudo service ssh restart || sudo service sshd restart; fi"
fi

sudo cp "$SSHD_CONFIG" "$SSHD_CONFIG.bak.$(date +%s)"
${sedInPlace('s/^#*PasswordAuthentication.*/PasswordAuthentication no/', '"$SSHD_CONFIG"')}
${sedInPlace('s/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/', '"$SSHD_CONFIG"')}
${sedInPlace('s/^#*UsePAM.*/UsePAM no/', '"$SSHD_CONFIG"')}
${sedInPlace('s/^#*PermitRootLogin.*/PermitRootLogin no/', '"$SSHD_CONFIG"')}
${sedInPlace('s/^#*MaxAuthTries.*/MaxAuthTries 3/', '"$SSHD_CONFIG"')}
${sedInPlace('s/^#*LoginGraceTime.*/LoginGraceTime 30/', '"$SSHD_CONFIG"')}

eval "$RESTART_CMD"
echo "SSH hardened successfully"
`;
}

export function generateFirewallScript(gatewayPort: number): string {
  return `#!/bin/bash
# OverClaw Firewall Rules
set -e

if command -v ufw &> /dev/null; then
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow ssh
  sudo ufw allow ${gatewayPort}/tcp comment "OverClaw Gateway"
  sudo ufw --force enable
  echo "UFW configured"
elif command -v firewall-cmd &> /dev/null; then
  sudo firewall-cmd --permanent --add-port=${gatewayPort}/tcp
  sudo firewall-cmd --reload
  echo "firewalld configured"
else
  echo "No supported firewall found (ufw/firewalld)"
fi
`;
}
