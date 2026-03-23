# 💰 SiYuan Precious Metals Monitor Plugin

Automatically scrapes ICBC (Industrial and Commercial Bank of China) precious metals prices, supporting multi-variety monitoring, real-time price alerts, and historical data visualization.

## ✨ Features

### 📊 Multi-Variety Support
Monitor 9 precious metal varieties:
- RMB Account Gold, Silver, Platinum, Palladium
- USD Account Gold, Silver, Platinum, Palladium
- Agency Physical Precious Metals

Each variety has independent historical data storage and can be enabled/disabled separately.

### 🔔 Smart Price Alerts
Four types of price alerts via SiYuan notifications:

| Alert Type | Description | Example |
|-----------|-------------|---------|
| **Price Above** | Alert when price reaches threshold | Gold rises to 1000 CNY/gram |
| **Price Below** | Alert when price falls below threshold | Gold drops to 800 CNY/gram |
| **Daily Change %** | Alert when daily change exceeds threshold | Daily fluctuation exceeds 3% |
| **Price Change %** | Alert when change from last query exceeds threshold | Single fluctuation exceeds 2% |

### 📈 Real-time Price Display
- Top bar button supports real-time price badge
- Select any variety to display on top bar
- Price changes shown in different colors (red=up, green=down)

### 📉 Historical Data Visualization
- Click 📈 button on top bar to open panel
- Real-time statistics: current price, highest, lowest, change
- Price trend chart (1 day/7 days/30 days/all time ranges)
- Detailed historical data table, up to 2000 records per variety

### ⏰ Auto Query
- Multiple refresh intervals: 10s, 30s, 1min, 5min, 10min, 15min, 30min
- Manual refresh support
- Independent storage for each variety's historical data

## 🚀 Usage Guide

### Step 1: Enable Monitoring Varieties

1. Click 📈 button on SiYuan top bar
2. Check varieties to monitor in the left panel
3. Each variety can have independent alert rules

### Step 2: Set Refresh Interval

1. Click "Settings" button in top right
2. Select "Query Interval" (default: 5 minutes)
3. Options: 10s, 30s, 1min, 5min, 10min, 15min, 30min

### Step 3: Configure Top Bar Display

1. Select "Top Bar Display" in settings panel
2. Choose which variety to display on top bar button
3. Select "None" to hide price badge

### Step 4: Set Alert Rules

1. Click variety in left panel
2. Click "Add Alert" or "Edit Alert" in alert overview
3. Set alert conditions (leave empty to disable)
4. Support multiple price thresholds (comma-separated)

### Step 5: View Data

1. Click variety in left panel to view details
2. View real-time price, trend chart, and historical data
3. Use time range buttons to switch chart view

## ⚙️ Configuration

### Global Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto Query | Enable scheduled queries | On |
| Query Interval | Auto query interval | 5 minutes |
| Notify on Query | Send notification after each query | Off |
| Top Bar Display | Show price badge on top bar | RMB Account Gold |

### Variety Settings

Each variety can be configured independently:

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Monitoring | Monitor this variety | Only RMB Gold enabled |
| Price Above | Alert when price ≥ threshold | Empty |
| Price Below | Alert when price ≤ threshold | Empty |
| Daily Change % | Alert when daily change exceeds % | 3% |
| Change % | Alert when change from last exceeds % | 2% |

## 🌐 Data Source

Data is retrieved from [ICBC Precious Metals Page](https://m.icbc.com.cn/mpage/precious-metal/list) using WebView to load the dynamic page and parse real-time price data.

Since the ICBC page loads data dynamically via JavaScript, the plugin creates a hidden WebView to render the page and extracts price information after the data is loaded.

> ⚠️ **Note**: Prices are for reference only. Please refer to actual trading prices.

## 🔒 Privacy

- All historical data stored locally
- Only requests data from ICBC official website
- Alerts sent locally via SiYuan notifications

## 📜 Changelog

### v2.0.0
- ✨ Changed to scrape ICBC precious metals data
- 🎯 Support 9 varieties independent monitoring
- 📈 Top bar button real-time price badge
- ⏱️ More refresh interval options (10s~30min)
- 🎨 Settings integrated into main panel
- 📦 Independent storage for each variety

### v1.0.0
- ✨ Initial release
- 📊 Historical data display and visualization
- 🔔 Four types of price alerts
- 🔌 Multi-interface configuration
- ⏰ Scheduled auto query

## 📄 License

MIT License

## 🤝 Contributing

Issues and PRs welcome!
