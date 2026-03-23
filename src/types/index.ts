// 理财插件类型定义

// 支持的贵金属品种
export const METAL_TYPES = [
    '人民币账户黄金',
    '人民币账户白银',
    '人民币账户铂金',
    '人民币账户钯金',
    '美元账户黄金',
    '美元账户白银',
    '美元账户铂金',
    '美元账户钯金',
] as const;

export type MetalType = typeof METAL_TYPES[number];

// 贵金属数据
export interface MetalDataItem {
    name: string;
    price: number;
    changePercent: number;
    updatetime: string;
}

// 历史数据记录
export interface PriceRecord {
    timestamp: number;
    date: string;
    time: string;
    price: number;
    changePercent: number;
}

// 单个品种的配置
export interface MetalConfig {
    enabled: boolean;
    // 价格涨到多少提醒
    priceAbove: string;
    // 价格跌到多少提醒
    priceBelow: string;
    // 日涨跌幅预警(%)
    dailyChangePercent: number;
    // 价格变化预警(%)
    changePercent: number;
}

// 插件设置
export interface FinanceSettings {
    // 是否启用定时查询
    autoQuery: boolean;
    // 查询间隔（秒）
    queryInterval: number;
    // 每次查询后是否通知
    notifyOnQuery: boolean;
    // 顶栏按钮显示的品种（为空则不显示）
    topBarDisplayMetal: string;
    // 各品种的配置
    metals: Record<string, MetalConfig>;
}

// 预警通知信息
export interface AlertNotification {
    type: 'priceAbove' | 'priceBelow' | 'dailyChange' | 'changePercent';
    productName: string;
    currentPrice: number;
    targetPrice?: number;
    percent?: number;
    message: string;
    timestamp: number;
}

// 默认设置
export const DEFAULT_SETTINGS: FinanceSettings = {
    autoQuery: true,
    queryInterval: 300, // 默认5分钟
    notifyOnQuery: false,
    topBarDisplayMetal: '人民币账户黄金',
    metals: {
        '人民币账户黄金': {
            enabled: true,
            priceAbove: '1000',
            priceBelow: '800',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '人民币账户白银': {
            enabled: false,
            priceAbove: '20',
            priceBelow: '10',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '人民币账户铂金': {
            enabled: false,
            priceAbove: '500',
            priceBelow: '300',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '人民币账户钯金': {
            enabled: false,
            priceAbove: '400',
            priceBelow: '200',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '美元账户黄金': {
            enabled: false,
            priceAbove: '3000',
            priceBelow: '2000',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '美元账户白银': {
            enabled: false,
            priceAbove: '100',
            priceBelow: '50',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '美元账户铂金': {
            enabled: false,
            priceAbove: '2500',
            priceBelow: '1500',
            dailyChangePercent: 3,
            changePercent: 2,
        },
        '美元账户钯金': {
            enabled: false,
            priceAbove: '2000',
            priceBelow: '1000',
            dailyChangePercent: 3,
            changePercent: 2,
        }
    },
};

// 获取默认品种配置
export function getDefaultMetalConfig(): MetalConfig {
    return {
        enabled: false,
        priceAbove: '',
        priceBelow: '',
        dailyChangePercent: 3,
        changePercent: 2,
    };
}
