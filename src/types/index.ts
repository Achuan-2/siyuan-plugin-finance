// 理财插件类型定义

// API返回的黄金数据
export interface GoldDataItem {
    typename: string;
    midprice: string;
    buyprice: string;
    sellprice: string;
    maxprice: string;
    minprice: string;
    updatetime: string;
}

export interface GoldApiResponse {
    status: number;
    msg: string;
    result: GoldDataItem[];
}

// 历史数据记录
export interface PriceRecord {
    timestamp: number;
    date: string;
    time: string;
    midprice: number;
    buyprice: number;
    sellprice: number;
    maxprice: number;
    minprice: number;
}

// 预警规则
export interface AlertRule {
    // 价格涨到多少提醒
    priceAbove?: number;
    // 价格跌到多少提醒
    priceBelow?: number;
    // 当天涨跌幅超过百分之几提醒（根据开盘价计算涨跌）
    dailyChangePercent?: number;
    // 比上次涨幅超过百分之几提醒
    changePercent?: number;
    // 最后通知日期（用于限制每日只通知一次）
    lastAlertDate?: string;
}

// 接口配置（内部使用）
export interface ApiConfig {
    id: string;
    name: string;
    url: string;
    // API密钥（如极速数据的appkey）
    appkey?: string;
    enabled: boolean;
    // 要监控的产品类型，如"人民币账户黄金"
    productTypes: string[];
    // 每个产品类型的预警规则
    alertRules: Record<string, AlertRule>;
    // 该接口的历史数据
    historyData: Record<string, PriceRecord[]>;
    // 上次检查的价格（用于计算涨幅）
    lastPrices: Record<string, number>;
}

// 插件设置（用于设置面板）
export interface FinanceSettings {
    // 是否启用定时查询
    autoQuery: boolean;
    // 查询间隔（分钟）
    queryInterval: number;
    // 黄金API密钥
    goldAppkey: string;
    // 是否启用黄金API
    goldEnabled: boolean;
    // 黄金价格上涨预警（支持逗号分隔多个价格，兼容旧数据为数字类型）
    goldPriceAbove: string | number;
    // 黄金价格下跌预警（支持逗号分隔多个价格，兼容旧数据为数字类型）
    goldPriceBelow: string | number;
    // 黄金日涨跌幅预警(%)
    goldDailyChangePercent: number;
    // 黄金价格变化预警(%)
    goldChangePercent: number;
}

// 预警通知信息
export interface AlertNotification {
    type: 'priceAbove' | 'priceBelow' | 'dailyChange' | 'changePercent';
    productName: string;
    apiName: string;
    currentPrice: number;
    targetPrice?: number;
    percent?: number;
    message: string;
    timestamp: number;
}
