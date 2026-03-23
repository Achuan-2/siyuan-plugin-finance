import { i18n } from "./pluginInstance";
import type { FinanceSettings, ApiConfig } from "./types";

export const getDefaultSettings = (): FinanceSettings => ({
    autoQuery: true,
    queryInterval: 30,
    apiConfigs: [
        {
            id: 'default-gold',
            name: '极速数据黄金API',
            url: 'https://api.jisuapi.com/gold/bank',
            appkey: '',  // 用户需要自行填写
            enabled: true,
            productTypes: ['人民币账户黄金'],
            alertRules: {
                '人民币账户黄金': {
                    priceAbove: 950,
                    priceBelow: 900,
                    dailyDropPercent: 3,
                    changePercent: 2
                }
            },
            historyData: {},
            lastPrices: {}
        }
    ]
});
