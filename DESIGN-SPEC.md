# Overclaw Design Specification

## Color System (Dark Theme)
- Page background: #0D1117
- Card/panel background: #161B22
- Card hover: #1C2333
- Border: #21262D
- Border light: #30363D
- Text primary: #E6EDF3
- Text secondary: #8B949E
- Text muted: #484F58
- Accent blue: #3B82F6
- Accent teal: #4ECDC4
- Accent green: #3FB950
- Accent yellow: #D29922
- Accent red: #F85149
- Active nav bg: rgba(59,130,246,0.12)
- Active nav left border: 3px solid #3B82F6

## Pages (8 total from PDF)

### Page 0: Sign In
- Centered card on dark bg
- Card bg: #161B22, border: 1px solid #21262D, border-radius: 12px
- Logo: teal gradient icon + "Overclaw" bold + "Powered by Openclaw" in teal
- Tagline: "Deploy and Manage your own AI agents 24/7" in muted gray
- Fields: Email, Password (dark input bg #0D1117, border #21262D)
- "Sign in" button: blue (#3B82F6), full width
- Links: "Create account" and "Forgot password?"
- Footer: "By continuing, you agree to Terms & Privacy."

### Page 1: Create Account
- Same card layout as Sign In
- Title: "Create Account"
- Fields: Email, Password, Confirm Password
- "Create Account" button
- Footer: Terms & Privacy

### Page 2: Forgot Password
- Same card layout
- Title: "Forgot Password"
- Field: Email only
- "Forgot Password" button

### Page 3: Local Page (Not Installed state)
- Three column: sidebar | main | right panel
- Top bar: "Local" title + search bar with ⌘K + "Open Control UI" button + avatar
- Main content:
  - Header: "Local OpenClaw" title + "Install and manage OpenClaw on this computer — no terminal required."
  - Setup wizard (3 steps):
    1. "Install OpenClaw" - "Downloads and installs OpenClaw on this device." [Install] [View details]
    2. "Run onboarding" - "Sets up the gateway and config securely." [Start onboarding]
    3. "Start gateway" - "Runs OpenClaw in the background on this device." [Start] [Stop]
  - "Install progress" panel - terminal-like area showing live output
  - Tip: "Once installed, this device can also act as a 'remote node' so you can manage it from anywhere."
- Right panel:
  - "Local status" card: OpenClaw=Not installed, Gateway=Stopped, Version=—, Local URL=http://127.0.0.1:18789
  - "Quick actions": Install OpenClaw, Start gateway, Open Control UI, Uninstall

### Page 4: Local Page (Installed state)
- Same layout as Page 3
- Header changes to: "Use the power of your personal machine - no billing required"
- Status shows: Installed, Idle, v1
- Quick actions change to: Start gateway, Change Model, Change Chat, Uninstall
- Tasks section appears:
  - "1 Active" tasks: Fill in tax return (Active), Send tenant emails (Active)
  - "3 Complete" section
  - "3 Queued" section: tasks with times (12:00 12/02/24)
- "Live TUI" terminal panel showing OpenClaw CLI output

### Page 5: Bots Page (main view)
- Three column layout
- "Bots" in top bar + search + "Create Bot" button
- Subtitle: "3 bots • 2 online • Default region: London (eu-west-2)"
- Bot table with Import + Create Bot buttons
- Table: Name, Status, Region, Uptime, URL, Actions(⋯)
- Right panel: Quick Actions (Start All, AWS, Kill), OpenClaw status card, AWS status card
- Below table: Billing card ($72.86/$120.00), Tasks (3 Queued)

### Page 6: Bot Actions Modal
- Same as Page 5 but with modal overlay on bot "SupportBot-1"
- Modal: dark card, title "SupportBot-1", subtitle "Actions — Control your agent"
- Close X button
- Action buttons stacked: Cancel, Save, Deploy, Change AI Model, Change Chat, Open Gateway, Stop (red)

### Page 7: Deploy Modal
- Same as Bots page with deploy modal
- Title: "Deploy New Bot"
- Subtitle: "Creates a 24/7 bot with its own public URL."
- Fields: Bot name (SupportBot-4), Region (London eu-west-2), Size (Small/Medium/Large toggle), Admin password
- Password note: "Used to finish initial setup and secure access."
- Buttons: Cancel, Deploy bot
