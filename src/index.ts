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
    ICardData
} from "siyuan";

import "@/index.scss";

import SettingPanel from "./SettingPanel.svelte";
import HistoryPanel from "./components/HistoryPanel.svelte";
import { setPluginInstance, i18n } from "./pluginInstance";
import { sendNotification } from "./api";
import type { FinanceSettings, ApiConfig, GoldDataItem, GoldApiResponse, PriceRecord, AlertRule, AlertNotification } from "./types";

export const SETTINGS_FILE = "settings.json";
export const HISTORY_FILE = "history.json";

// 默认设置
const getDefaultSettings = (): FinanceSettings => ({
    autoQuery: true,
    queryInterval: 30,
    goldAppkey: '',
    goldEnabled: true,
    goldPriceAbove: '950',
    goldPriceBelow: '900',
    goldDailyChangePercent: 3,
    goldChangePercent: 2,
});

export default class FinancePlugin extends Plugin {
    // 本地缓存的设置
    settings: FinanceSettings | null = null;
    // 历史数据
    historyData: PriceRecord[] = [];
    // 上次价格
    lastPrice: number | null = null;
    // 最后通知日期
    lastAlertDate: string = '';
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

        // 加载历史数据
        await this.loadHistoryData();

        // 添加顶栏按钮
        this.addTopBarButton();

        // 启动定时查询
        this.startAutoQuery();

        console.log("[FinancePlugin] 理财插件已加载");
    }

    async onLayoutReady() {
        // 布局加载完成时调用
        // 注：不在此处立即查询，而是按照设置的时间间隔由 checkAndQuery 触发
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
        if (!this.settings?.goldEnabled) return;

        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        const interval = this.settings?.queryInterval || 30;
        let isQueryTime = false;

        if (interval === 60) {
            // 每1小时：只在整点查询
            isQueryTime = minutes === 0 && seconds <= 30;
        } else if (interval === 30) {
            // 每30分钟：在整点和半点查询
            isQueryTime = (minutes === 0 || minutes === 30) && seconds <= 30;
        } else if (interval === 15) {
            // 每15分钟：在00, 15, 30, 45分钟查询
            isQueryTime = (minutes === 0 || minutes === 15 || minutes === 30 || minutes === 45) && seconds <= 30;
        }

        if (isQueryTime) {
            console.log(`[FinancePlugin] 到达查询时间: ${now.toLocaleString()}`);
            await this.queryGoldPrice();
        }
    }

    /**
     * 查询黄金价格
     */
    private async queryGoldPrice() {
        if (!this.settings?.goldEnabled) return;
        if (!this.settings?.goldAppkey) {
            console.log("[FinancePlugin] 未配置appkey，跳过查询");
            return;
        }

        console.log("[FinancePlugin] 查询黄金价格");

        try {
            const url = `https://api.jisuapi.com/gold/bank?appkey=${this.settings.goldAppkey}`;
            const response = await fetch(url);
            const data: GoldApiResponse = await response.json();

            if (data.status !== 0) {
                throw new Error(data.msg);
            }

            // 查找人民币账户黄金数据
            const goldData = data.result.find(r => r.typename === '人民币账户黄金');
            if (!goldData) {
                console.warn("[FinancePlugin] 未找到人民币账户黄金数据");
                return;
            }

            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().slice(0, 5);

            // 创建价格记录
            const record: PriceRecord = {
                timestamp: now.getTime(),
                date: dateStr,
                time: timeStr,
                midprice: parseFloat(goldData.midprice),
                buyprice: parseFloat(goldData.buyprice),
                sellprice: parseFloat(goldData.sellprice),
                maxprice: parseFloat(goldData.maxprice),
                minprice: parseFloat(goldData.minprice)
            };

            // 添加记录
            this.historyData.push(record);

            // 限制历史数据数量（保留最近1000条）
            if (this.historyData.length > 1000) {
                this.historyData = this.historyData.slice(-1000);
            }

            // 保存历史数据
            await this.saveHistoryData();

            // 检查预警
            await this.checkAlerts(record);

            // 更新上次价格
            this.lastPrice = record.midprice;

            console.log(`[FinancePlugin] 黄金价格查询完成: ${record.midprice}`);
        } catch (e) {
            console.error("[FinancePlugin] 查询黄金价格失败:", e);
        }
    }

    /**
     * 检查预警条件
     */
    private async checkAlerts(record: PriceRecord) {
        if (!this.settings) return;

        const notifications: AlertNotification[] = [];
        const currentPrice = record.midprice;
        const today = record.date;

        // 检查今日是否已发送过日涨跌幅通知
        const dailyAlertSentToday = this.lastAlertDate === today;

        // 1. 检查价格涨到多少（支持多个价格阈值，用逗号分隔）
        if (this.settings.goldPriceAbove) {
            const prices = this.parseMultiPrice(this.settings.goldPriceAbove);
            for (const targetPrice of prices) {
                if (currentPrice >= targetPrice) {
                    if (!this.lastPrice || this.lastPrice < targetPrice) {
                        notifications.push({
                            type: 'priceAbove',
                            productName: '人民币账户黄金',
                            apiName: '极速数据黄金API',
                            currentPrice,
                            targetPrice: targetPrice,
                            message: `人民币账户黄金价格涨至 ${currentPrice.toFixed(2)}，已超过设定值 ${targetPrice}`,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // 2. 检查价格跌到多少（支持多个价格阈值，用逗号分隔）
        if (this.settings.goldPriceBelow) {
            const prices = this.parseMultiPrice(this.settings.goldPriceBelow);
            for (const targetPrice of prices) {
                if (currentPrice <= targetPrice) {
                    if (!this.lastPrice || this.lastPrice > targetPrice) {
                        notifications.push({
                            type: 'priceBelow',
                            productName: '人民币账户黄金',
                            apiName: '极速数据黄金API',
                            currentPrice,
                            targetPrice: targetPrice,
                            message: `人民币账户黄金价格跌至 ${currentPrice.toFixed(2)}，已低于设定值 ${targetPrice}`,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // 3. 检查当天涨跌幅
        if (this.settings.goldDailyChangePercent && !dailyAlertSentToday) {
            let changePercent = 0;
            let direction = '';

            // 基于当日最高价计算跌幅
            if (record.maxprice > 0) {
                const dropPercent = ((record.maxprice - currentPrice) / record.maxprice) * 100;
                if (dropPercent >= this.settings.goldDailyChangePercent) {
                    changePercent = dropPercent;
                    direction = '下跌';
                }
            }

            // 基于当日最低价计算涨幅
            if (record.minprice > 0 && direction === '') {
                const risePercent = ((currentPrice - record.minprice) / record.minprice) * 100;
                if (risePercent >= this.settings.goldDailyChangePercent) {
                    changePercent = risePercent;
                    direction = '上涨';
                }
            }

            if (direction !== '') {
                notifications.push({
                    type: 'dailyChange',
                    productName: '人民币账户黄金',
                    apiName: '极速数据黄金API',
                    currentPrice,
                    percent: changePercent,
                    message: `人民币账户黄金当天已${direction} ${changePercent.toFixed(2)}%，超过设定值 ${this.settings.goldDailyChangePercent}%`,
                    timestamp: Date.now()
                });
                this.lastAlertDate = today;
            }
        }

        // 4. 检查比上次涨幅
        if (this.settings.goldChangePercent && this.lastPrice && this.lastPrice > 0) {
            const changePercent = ((currentPrice - this.lastPrice) / this.lastPrice) * 100;
            if (Math.abs(changePercent) >= this.settings.goldChangePercent) {
                const direction = changePercent > 0 ? '上涨' : '下跌';
                notifications.push({
                    type: 'changePercent',
                    productName: '人民币账户黄金',
                    apiName: '极速数据黄金API',
                    currentPrice,
                    percent: changePercent,
                    message: `人民币账户黄金价格${direction} ${Math.abs(changePercent).toFixed(2)}%，超过设定值 ${this.settings.goldChangePercent}%`,
                    timestamp: Date.now()
                });
            }
        }

        // 发送通知
        for (const notification of notifications) {
            await this.sendAlertNotification(notification);
        }
    }

    /**
     * 发送通知（使用api.ts的sendNotification）
     */
    private async sendAlertNotification(notification: AlertNotification) {
        const title = `⚠️ ${notification.apiName} - ${notification.productName}`;
        const body = notification.message;

        try {
            await sendNotification(title, body);
            console.log(`[FinancePlugin] 通知已发送: ${title} - ${body}`);
        } catch (e) {
            console.error(`[FinancePlugin] 发送通知失败:`, e);
            // 如果失败，使用 showMessage 作为备选
            showMessage(`${title}\n${body}`, 5000, "error");
        }
    }

    /**
     * 解析多价格字符串（支持英文逗号和中文逗号）
     */
    private parseMultiPrice(priceStr: string | number): number[] {
        if (!priceStr) return [];
        // 兼容旧数据格式（数字类型）
        if (typeof priceStr === 'number') {
            return priceStr > 0 ? [priceStr] : [];
        }
        return priceStr
            .split(/[,，]/)
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p) && p > 0);
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
        this.settings = { ...defaultSettings, ...settings };
        return this.settings;
    }

    /**
     * 保存设置
     */
    async saveSettings(settings: FinanceSettings) {
        this.settings = settings;
        await this.saveData(SETTINGS_FILE, settings);
    }

    /**
     * 加载历史数据
     */
    async loadHistoryData() {
        const data = await this.loadData(HISTORY_FILE);
        if (data && Array.isArray(data.records)) {
            this.historyData = data.records;
            this.lastPrice = data.lastPrice || null;
            this.lastAlertDate = data.lastAlertDate || '';
        }
    }

    /**
     * 保存历史数据
     */
    async saveHistoryData() {
        await this.saveData(HISTORY_FILE, {
            records: this.historyData,
            lastPrice: this.lastPrice,
            lastAlertDate: this.lastAlertDate
        });
    }

    /**
     * 清空历史数据
     */
    async clearHistoryData() {
        this.historyData = [];
        this.lastPrice = null;
        this.lastAlertDate = '';
        await this.saveData(HISTORY_FILE, {
            records: [],
            lastPrice: null,
            lastAlertDate: ''
        });
    }

    /**
     * 获取历史数据（供组件使用）
     */
    getHistoryData(): PriceRecord[] {
        return this.historyData;
    }

    /**
     * 手动触发查询（供外部调用）
     */
    async manualQuery() {
        if (!this.settings?.goldEnabled) {
            showMessage("请先启用黄金API", 3000, "error");
            return;
        }
        if (!this.settings?.goldAppkey) {
            showMessage("请先配置API密钥(appkey)", 3000, "error");
            return;
        }
        showMessage("正在查询最新数据...", 2000);
        await this.queryGoldPrice();
        showMessage("查询完成", 2000);
    }
}
