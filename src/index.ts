import {
    Plugin,
    showMessage,
    confirm,
    Dialog,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    getBackend,
    IModel,
    Protyle,
    openWindow,
    IOperation,
    Constants,
    openMobileFileById,
    lockScreen,
    ICard,
    ICardData,
    fetchSyncPost
} from "siyuan";

import "@/index.scss";

import SettingPanel from "./SettingPanel.svelte";
import HistoryPanel from "./components/HistoryPanel.svelte";
import { getDefaultSettings } from "./defaultSettings";
import { setPluginInstance, i18n } from "./pluginInstance";
import type { FinanceSettings, ApiConfig, GoldDataItem, GoldApiResponse, PriceRecord, AlertRule, AlertNotification } from "./types";

export const SETTINGS_FILE = "settings.json";
export const HISTORY_FILE = "history.json";

export default class FinancePlugin extends Plugin {
    // 本地缓存的设置
    settings: FinanceSettings | null = null;
    // 定时器
    private queryTimer: number | null = null;
    // 顶栏按钮
    private topBarElement: HTMLElement | null = null;
    // 历史数据面板
    private historyDialog: Dialog | null = null;

    async onload() {
        // 插件被启用时会自动调用这个函数
        setPluginInstance(this);

        // 加载设置
        await this.loadSettings(true);

        // 添加顶栏按钮
        this.addTopBarButton();

        // 启动定时查询
        this.startAutoQuery();

        console.log("[FinancePlugin] 理财插件已加载");
    }

    async onLayoutReady() {
        // 布局加载完成时调用
        // 立即执行一次查询
        await this.queryAllApis();
    }

    onunload() {
        // 当插件被禁用的时候调用
        this.stopAutoQuery();
        if (this.topBarElement) {
            this.topBarElement.remove();
        }
        if (this.historyDialog) {
            this.historyDialog.destroy();
        }
    }

    async uninstall() {
        await this.onunload();
    }

    /**
     * 添加顶栏按钮
     */
    private addTopBarButton() {
        this.topBarElement = this.addTopBar({
            icon: "iconChart",
            title: "理财数据监控",
            position: "right",
            callback: () => {
                this.openHistoryPanel();
            }
        });

        // 如果没有图标，使用自定义HTML
        if (this.topBarElement) {
            this.topBarElement.innerHTML = `
                <span style="font-size: 16px;">📈</span>
            `;
            this.topBarElement.title = "理财数据监控";
            this.topBarElement.style.cursor = "pointer";
        }
    }

    /**
     * 打开历史数据面板
     */
    private openHistoryPanel() {
        if (this.historyDialog) {
            this.historyDialog.destroy();
        }

        this.historyDialog = new Dialog({
            title: "📈 理财数据监控",
            content: `<div id="FinanceHistoryPanel" style="height: 100%;"></div>`,
            width: "1000px",
            height: "700px",
            destroyCallback: () => {
                if (panel) {
                    panel.$destroy();
                }
                this.historyDialog = null;
            }
        });

        const panel = new HistoryPanel({
            target: this.historyDialog.element.querySelector("#FinanceHistoryPanel"),
            props: {
                plugin: this,
                onClose: () => {
                    if (this.historyDialog) {
                        this.historyDialog.destroy();
                    }
                }
            }
        });
    }

    /**
     * 启动自动查询
     */
    private startAutoQuery() {
        if (this.queryTimer) {
            clearInterval(this.queryTimer);
        }

        // 每30秒检查一次是否需要查询（实际间隔在设置中配置，默认30分钟）
        this.queryTimer = window.setInterval(() => {
            this.checkAndQuery();
        }, 30000);

        console.log("[FinancePlugin] 自动查询已启动");
    }

    /**
     * 停止自动查询
     */
    private stopAutoQuery() {
        if (this.queryTimer) {
            clearInterval(this.queryTimer);
            this.queryTimer = null;
        }
    }

    /**
     * 检查是否需要执行查询（根据时间）
     */
    private async checkAndQuery() {
        if (!this.settings?.autoQuery) return;

        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        // 只在整点或半点的前后30秒内执行查询
        // 即 00, 30 分钟的时候
        const isQueryTime = (minutes === 0 || minutes === 30) && seconds <= 30;

        if (isQueryTime) {
            console.log(`[FinancePlugin] 到达查询时间: ${now.toLocaleString()}`);
            await this.queryAllApis();
        }
    }

    /**
     * 查询所有启用的API
     */
    private async queryAllApis() {
        if (!this.settings) return;

        for (const apiConfig of this.settings.apiConfigs) {
            if (apiConfig.enabled) {
                try {
                    await this.queryApi(apiConfig);
                } catch (e) {
                    console.error(`[FinancePlugin] 查询接口失败 ${apiConfig.name}:`, e);
                }
            }
        }
    }

    /**
     * 查询单个API
     */
    private async queryApi(apiConfig: ApiConfig) {
        console.log(`[FinancePlugin] 查询接口: ${apiConfig.name}`);

        const response = await fetch(apiConfig.url);
        const data: GoldApiResponse = await response.json();

        if (data.status !== 0) {
            throw new Error(data.msg);
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().slice(0, 5);

        // 处理每个监控的产品
        for (const productType of apiConfig.productTypes) {
            const productData = data.result.find(r => r.typename === productType);
            if (!productData) {
                console.warn(`[FinancePlugin] 未找到产品数据: ${productType}`);
                continue;
            }

            // 创建价格记录
            const record: PriceRecord = {
                timestamp: now.getTime(),
                date: dateStr,
                time: timeStr,
                midprice: parseFloat(productData.midprice),
                buyprice: parseFloat(productData.buyprice),
                sellprice: parseFloat(productData.sellprice),
                maxprice: parseFloat(productData.maxprice),
                minprice: parseFloat(productData.minprice)
            };

            // 初始化历史数据数组
            if (!apiConfig.historyData[productType]) {
                apiConfig.historyData[productType] = [];
            }

            // 添加记录
            apiConfig.historyData[productType].push(record);

            // 限制历史数据数量（保留最近1000条）
            if (apiConfig.historyData[productType].length > 1000) {
                apiConfig.historyData[productType] = apiConfig.historyData[productType].slice(-1000);
            }

            // 检查预警
            await this.checkAlerts(apiConfig, productType, record);

            // 更新上次价格
            apiConfig.lastPrices[productType] = record.midprice;
        }

        // 保存更新后的配置
        await this.saveSettings(this.settings);

        console.log(`[FinancePlugin] 接口 ${apiConfig.name} 查询完成`);
    }

    /**
     * 检查预警条件
     */
    private async checkAlerts(apiConfig: ApiConfig, productType: string, record: PriceRecord) {
        const alertRule = apiConfig.alertRules[productType];
        if (!alertRule) return;

        const notifications: AlertNotification[] = [];
        const currentPrice = record.midprice;
        const lastPrice = apiConfig.lastPrices[productType];

        // 1. 检查价格涨到多少
        if (alertRule.priceAbove && currentPrice >= alertRule.priceAbove) {
            // 检查上次是否已经超过（避免重复提醒）
            if (!lastPrice || lastPrice < alertRule.priceAbove) {
                notifications.push({
                    type: 'priceAbove',
                    productName: productType,
                    apiName: apiConfig.name,
                    currentPrice,
                    targetPrice: alertRule.priceAbove,
                    message: `${productType} 价格上涨至 ${currentPrice.toFixed(2)}，已超过设定值 ${alertRule.priceAbove}`,
                    timestamp: Date.now()
                });
            }
        }

        // 2. 检查价格跌到多少
        if (alertRule.priceBelow && currentPrice <= alertRule.priceBelow) {
            // 检查上次是否还高于此值（避免重复提醒）
            if (!lastPrice || lastPrice > alertRule.priceBelow) {
                notifications.push({
                    type: 'priceBelow',
                    productName: productType,
                    apiName: apiConfig.name,
                    currentPrice,
                    targetPrice: alertRule.priceBelow,
                    message: `${productType} 价格下跌至 ${currentPrice.toFixed(2)}，已低于设定值 ${alertRule.priceBelow}`,
                    timestamp: Date.now()
                });
            }
        }

        // 3. 检查当天跌幅（根据当前值比最大值的跌幅）
        if (alertRule.dailyDropPercent && record.maxprice > 0) {
            const dropPercent = ((record.maxprice - currentPrice) / record.maxprice) * 100;
            if (dropPercent >= alertRule.dailyDropPercent) {
                notifications.push({
                    type: 'dailyDrop',
                    productName: productType,
                    apiName: apiConfig.name,
                    currentPrice,
                    percent: dropPercent,
                    message: `${productType} 当天已从最高价 ${record.maxprice} 下跌 ${dropPercent.toFixed(2)}%，超过设定值 ${alertRule.dailyDropPercent}%`,
                    timestamp: Date.now()
                });
            }
        }

        // 4. 检查比上次涨幅
        if (alertRule.changePercent && lastPrice && lastPrice > 0) {
            const changePercent = ((currentPrice - lastPrice) / lastPrice) * 100;
            if (Math.abs(changePercent) >= alertRule.changePercent) {
                const direction = changePercent > 0 ? '上涨' : '下跌';
                notifications.push({
                    type: 'changePercent',
                    productName: productType,
                    apiName: apiConfig.name,
                    currentPrice,
                    percent: changePercent,
                    message: `${productType} 价格${direction} ${Math.abs(changePercent).toFixed(2)}%，超过设定值 ${alertRule.changePercent}%`,
                    timestamp: Date.now()
                });
            }
        }

        // 发送通知
        for (const notification of notifications) {
            await this.sendNotification(notification);
        }
    }

    /**
     * 发送通知（使用思源的通知API）
     */
    private async sendNotification(notification: AlertNotification) {
        const title = `⚠️ ${notification.apiName} - ${notification.productName}`;
        const body = notification.message;

        // 使用思源的 pushMsg 发送通知
        try {
            const response = await fetchSyncPost("/api/notification/pushMsg", {
                msg: `${title}\n${body}`,
                timeout: 10000  // 10秒
            });
            console.log(`[FinancePlugin] 通知已发送:`, response);
        } catch (e) {
            // 如果 pushMsg 失败，使用 showMessage
            showMessage(`${title}\n${body}`, 5000, "error");
        }

        console.log(`[FinancePlugin] 预警通知: ${title} - ${body}`);
    }

    /**
     * 打开设置对话框
     */
    async openSetting() {
        let dialog = new Dialog({
            title: "理财插件设置",
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "900px",
            height: "700px",
            destroyCallback: () => {
                pannel.$destroy();
            }
        });

        let pannel = new SettingPanel({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
    }

    /**
     * 加载设置
     */
    async loadSettings(update: boolean = false): Promise<FinanceSettings> {
        if (!update && this.settings) {
            return this.settings;
        }

        const settings = await this.loadData(SETTINGS_FILE);
        const defaultSettings = getDefaultSettings();
        this.settings = this.mergeSettings(defaultSettings, settings);
        return this.settings;
    }

    /**
     * 合并设置（深度合并）
     */
    private mergeSettings(defaults: FinanceSettings, saved: any): FinanceSettings {
        if (!saved) return defaults;
        
        return {
            autoQuery: saved.autoQuery ?? defaults.autoQuery,
            queryInterval: saved.queryInterval ?? defaults.queryInterval,
            apiConfigs: saved.apiConfigs?.map((api: any, index: number) => ({
                ...defaults.apiConfigs[index],
                ...api,
                alertRules: api.alertRules || {},
                historyData: api.historyData || {},
                lastPrices: api.lastPrices || {}
            })) || defaults.apiConfigs
        };
    }

    /**
     * 保存设置
     */
    async saveSettings(settings: FinanceSettings) {
        this.settings = settings;
        await this.saveData(SETTINGS_FILE, settings);
    }

    /**
     * 手动触发查询（供外部调用）
     */
    async manualQuery() {
        showMessage("正在查询最新数据...", 2000);
        await this.queryAllApis();
        showMessage("查询完成", 2000);
    }

    /**
     * 获取API历史数据（供组件使用）
     */
    async getHistoryData(apiId: string, productType: string): Promise<PriceRecord[]> {
        await this.loadSettings();
        const api = this.settings?.apiConfigs.find(a => a.id === apiId);
        return api?.historyData[productType] || [];
    }
}
