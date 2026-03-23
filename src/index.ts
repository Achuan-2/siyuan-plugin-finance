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

import HistoryPanel from "./components/HistoryPanel.svelte";
import { setPluginInstance, i18n } from "./pluginInstance";
import { sendNotification } from "./api";
import type { FinanceSettings, MetalConfig, PriceRecord, AlertNotification, MetalDataItem } from "./types";
import { DEFAULT_SETTINGS, METAL_TYPES } from "./types";

export const SETTINGS_FILE = "settings.json";
export const ICBC_URL = "https://m.icbc.com.cn/mpage/precious-metal/list";

// 数据文件前缀
const DATA_FILE_PREFIX = "metal_data_";

export default class FinancePlugin extends Plugin {
    // 本地缓存的设置
    settings: FinanceSettings = DEFAULT_SETTINGS;
    // 当前价格数据
    currentPrices: Map<string, MetalDataItem> = new Map();
    // 上次价格（用于计算涨幅）
    lastPrices: Map<string, number> = new Map();
    // 最后通知日期
    lastAlertDates: Map<string, string> = new Map();
    // 定时器
    private queryTimer: number | null = null;
    // 顶栏按钮
    private topBarElement: HTMLElement | null = null;
    // 历史数据面板
    private historyDialog: Dialog | null = null;
    // 徽章元素
    private badgeElement: HTMLElement | null = null;

    async onload() {
        this.addIcons(`
                <symbol id="iconFianceChart" viewBox="0 0 1024 1024">
<path d="M843.377778 836.266667h-597.333334c-15.644444 0-28.444444-12.8-28.444445-28.444445V297.244444c0-15.644444 12.8-28.444444 28.444444-28.444444s28.444444 12.8 28.444445 28.444444v482.133334h568.888889c15.644444 0 28.444444 12.8 28.444444 28.444444s-12.8 28.444444-28.444444 28.444445z" fill="#3FA6AD" p-id="5827"></path><path d="M345.6 728.177778c-7.111111 0-14.222222-2.844444-19.911111-7.111111-11.377778-11.377778-12.8-28.444444-1.422222-39.822223L455.111111 540.444444c5.688889-7.111111 15.644444-9.955556 24.177778-8.533333l164.977778 19.911111 125.155555-199.111111c8.533333-12.8 25.6-17.066667 39.822222-8.533333 12.8 8.533333 17.066667 25.6 8.533334 39.822222l-133.688889 213.333333c-5.688889 9.955556-17.066667 14.222222-27.022222 12.8l-169.244445-21.333333-120.888889 129.422222c-5.688889 7.111111-12.8 9.955556-21.333333 9.955556z" fill="#DC4569" p-id="5828"></path>
                </symbol>
            `);
        // 插件被启用时会自动调用这个函数
        setPluginInstance(this);

        // 加载设置
        await this.loadSettings(true);

        // 添加上下文菜单
        this.addTopBarButton();

        // 启动定时查询
        this.startAutoQuery();

        console.log("[FinancePlugin] 理财插件已加载");
    }

    async onLayoutReady() {
        // 布局加载完成时调用
        // 立即执行一次查询
        await this.queryAllMetals();
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
        // 清理WebView容器
        if (this.webviewContainer) {
            this.webviewContainer.remove();
            this.webviewContainer = null;
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
            icon: "iconFianceChart",
            title: "贵金属价格监控",
            position: "right",
            callback: () => {
                this.openHistoryPanel();
            }
        });

        // 添加徽章显示实时价格
        this.addPriceBadge();
    }

    /**
     * 添加价格徽章到顶栏按钮
     */
    private addPriceBadge() {
        if (!this.topBarElement) return;

        // 创建徽章元素
        this.badgeElement = document.createElement("span");
        this.badgeElement.className = "finance-price-badge";
        this.badgeElement.style.cssText = `
            position: absolute;
            bottom: -2px;
            right: -2px;
            font-size: 10px;
            background: var(--b3-theme-primary);
            color: white;
            padding: 1px 4px;
            border-radius: 8px;
            min-width: 18px;
            text-align: center;
            font-weight: 600;
            pointer-events: none;
            white-space: nowrap;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        this.badgeElement.style.display = "none";

        // 设置父元素为相对定位
        this.topBarElement.style.position = "relative";
        this.topBarElement.appendChild(this.badgeElement);

        // 更新徽章显示
        this.updatePriceBadge();
    }

    /**
     * 更新价格徽章显示
     */
    private updatePriceBadge() {
        if (!this.badgeElement) return;

        const displayMetal = this.settings?.topBarDisplayMetal;
        if (!displayMetal || displayMetal === 'none') {
            this.badgeElement.style.display = "none";
            return;
        }

        const data = this.currentPrices.get(displayMetal);
        if (data) {
            this.badgeElement.textContent = data.price.toFixed(2);
            this.badgeElement.style.display = "block";
            // 根据涨跌设置颜色
            if (data.changePercent > 0) {
                this.badgeElement.style.background = "#ff4d4f"; // 红色涨
            } else if (data.changePercent < 0) {
                this.badgeElement.style.background = "#52c41a"; // 绿色跌
            } else {
                this.badgeElement.style.background = "var(--b3-theme-primary)";
            }
        } else {
            this.badgeElement.style.display = "none";
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
            title: "📈 贵金属价格监控",
            content: `<div id="FinanceHistoryPanel" style="height: 100%;"></div>`,
            width: "1100px",
            height: "750px",
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

        // 根据设置的间隔启动定时器
        const intervalMs = (this.settings?.queryInterval || 300) * 1000;
        this.queryTimer = window.setInterval(() => {
            this.checkAndQuery();
        }, intervalMs);

        console.log("[FinancePlugin] 自动查询已启动，间隔:", intervalMs, "ms");
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
     * 重新启动自动查询（设置改变时调用）
     */
    restartAutoQuery() {
        this.stopAutoQuery();
        if (this.settings?.autoQuery) {
            this.startAutoQuery();
        }
    }

    /**
     * 检查是否需要执行查询
     */
    private async checkAndQuery() {
        if (!this.settings?.autoQuery) return;

        // 周末不自动查询（周六=6，周日=0）
        const now = new Date();
        const dayOfWeek = now.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            console.log(`[FinancePlugin] 周末暂停自动查询: ${now.toLocaleString()}`);
            return;
        }

        // 检查是否有启用的品种
        const hasEnabled = Object.values(this.settings?.metals || {}).some(m => m.enabled);
        if (!hasEnabled) return;

        console.log(`[FinancePlugin] 执行定时查询: ${now.toLocaleString()}`);
        await this.queryAllMetals();
    }

    /**
     * 查询所有启用的贵金属价格
     */
    async queryAllMetals() {
        try {
            console.log("[FinancePlugin] 开始查询贵金属价格");

            // 使用WebView加载动态页面获取数据
            const metalsData = await this.fetchICBCDataWithWebview();

            if (metalsData.length === 0) {
                console.warn("[FinancePlugin] 未获取到任何贵金属数据");
                return;
            }

            // 更新当前价格
            for (const data of metalsData) {
                this.currentPrices.set(data.name, data);
            }

            // 保存数据并检查预警
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().slice(0, 5);

            for (const data of metalsData) {
                const config = this.settings?.metals?.[data.name];
                if (!config?.enabled) continue;

                // 创建价格记录
                const record: PriceRecord = {
                    timestamp: now.getTime(),
                    date: dateStr,
                    time: timeStr,
                    price: data.price,
                    changePercent: data.changePercent
                };

                // 添加到历史数据
                await this.addPriceRecord(data.name, record);

                // 检查预警
                await this.checkAlerts(data.name, data.price, record);

                // 更新上次价格
                this.lastPrices.set(data.name, data.price);
            }

            // 更新顶栏徽章
            this.updatePriceBadge();

            // 查询后通知
            if (this.settings?.notifyOnQuery) {
                const enabledMetals = metalsData.filter(m => this.settings?.metals?.[m.name]?.enabled);
                if (enabledMetals.length > 0) {
                    const message = enabledMetals.map(m => `${m.name}: ${m.price.toFixed(2)}`).join('\n');
                    await sendNotification('📊 贵金属价格查询', message);
                }
            }

            console.log(`[FinancePlugin] 贵金属价格查询完成，共 ${metalsData.length} 条数据`);
        } catch (e) {
            console.error("[FinancePlugin] 查询贵金属价格失败:", e);
        }
    }

    // WebView容器
    private webviewContainer: HTMLElement | null = null;
    private webviewElement: any = null;

    /**
     * 使用WebView加载工商银行页面并获取数据
     */
    private async fetchICBCDataWithWebview(): Promise<MetalDataItem[]> {
        return new Promise((resolve, reject) => {
            console.log('[FinancePlugin] 开始创建 WebView...');
            
            // 检查是否在 Electron 环境中
            if (!window.require) {
                reject(new Error('WebView 需要 Electron 环境'));
                return;
            }

            // 创建隐藏的webview容器
            if (!this.webviewContainer) {
                this.webviewContainer = document.createElement('div');
                this.webviewContainer.style.cssText = `
                    position: fixed;
                    left: -9999px;
                    top: -9999px;
                    width: 400px;
                    height: 600px;
                    overflow: hidden;
                    opacity: 0;
                    pointer-events: none;
                    z-index: -1;
                `;
                document.body.appendChild(this.webviewContainer);
            }

            // 创建webview元素
            const webview = document.createElement('webview');
            webview.src = ICBC_URL;
            webview.style.cssText = 'width: 100%; height: 100%;';
            webview.setAttribute('nodeintegration', 'false');
            webview.setAttribute('disablewebsecurity', 'true');
            webview.setAttribute('allowpopups', 'false');

            let timeoutId: number | null = null;
            let isResolved = false;

            const cleanup = () => {
                console.log('[FinancePlugin] 清理 WebView');
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (webview.parentNode) {
                    webview.parentNode.removeChild(webview);
                }
            };

            const handleError = (error: Error) => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    console.error('[FinancePlugin] WebView 错误:', error);
                    reject(error);
                }
            };

            const handleSuccess = (data: MetalDataItem[]) => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    console.log('[FinancePlugin] WebView 成功获取数据:', data);
                    resolve(data);
                }
            };

            // 设置超时
            timeoutId = window.setTimeout(() => {
                handleError(new Error('WebView加载超时(30秒)'));
            }, 30000);

            webview.addEventListener('dom-ready', async () => {
                try {
                    console.log('[FinancePlugin] WebView DOM ready, 等待数据渲染...');
                    
                    // 等待页面数据加载完成（总共等待5秒）
                    await new Promise(r => setTimeout(r, 5000));
                    
                    // 执行JavaScript获取页面数据
                    const jsCode = `
                        (function() {
                            console.log('[FinancePlugin] 开始解析页面数据...');
                            const results = [];
                            let updateTime = '';
                            
                            // 获取更新时间
                            const timeElements = document.querySelectorAll('.noticeTime .van-notice-bar__content');
                            console.log('[FinancePlugin] 找到', timeElements.length, '个时间元素');
                            for (const el of timeElements) {
                                const text = el.textContent || '';
                                const match = text.match(/查询时间[:：]\\s*(\\d{2}:\\d{2}:\\d{2})/);
                                if (match) {
                                    updateTime = match[1];
                                    break;
                                }
                            }
                            
                            // 解析账户贵金属数据
                            const cells = document.querySelectorAll('.van-cell');
                            console.log('[FinancePlugin] 找到', cells.length, '个数据单元格');
                            
                            for (const cell of cells) {
                                const row = cell.querySelector('.van-row');
                                if (!row) continue;
                                
                                const cols = row.querySelectorAll('.van-col');
                                if (cols.length < 3) continue;
                                
                                const name = cols[0].textContent?.trim() || '';
                                const priceText = cols[1].textContent?.trim() || '';
                                const changeText = cols[2].textContent?.trim() || '';
                                
                                // 支持的品种列表
                                const supportedTypes = [
                                    '人民币账户黄金', '人民币账户白银', '人民币账户铂金', '人民币账户钯金',
                                    '美元账户黄金', '美元账户白银', '美元账户铂金', '美元账户钯金',
                                    '代理实物贵金属'
                                ];
                                
                                if (!supportedTypes.includes(name)) continue;
                                
                                const price = parseFloat(priceText);
                                const changePercent = parseFloat(changeText);
                                
                                if (!isNaN(price)) {
                                    results.push({
                                        name,
                                        price,
                                        changePercent: isNaN(changePercent) ? 0 : changePercent,
                                        updatetime: updateTime || new Date().toLocaleTimeString()
                                    });
                                }
                            }
                            
                            console.log('[FinancePlugin] 解析完成，找到', results.length, '条数据');
                            return results;
                        })()
                    `;

                    console.log('[FinancePlugin] 执行 JavaScript...');
                    let data;
                    try {
                        data = await webview.executeJavaScript(jsCode, true);
                    } catch (execError) {
                        console.error('[FinancePlugin] executeJavaScript 错误:', execError);
                        handleError(new Error('执行页面脚本失败: ' + execError));
                        return;
                    }
                    
                    console.log('[FinancePlugin] WebView 返回数据:', data);
                    
                    if (Array.isArray(data) && data.length > 0) {
                        handleSuccess(data);
                    } else {
                        // 如果没有获取到数据，尝试再次等待后重试
                        console.log('[FinancePlugin] 首次未获取到数据，2秒后重试...');
                        await new Promise(r => setTimeout(r, 2000));
                        
                        try {
                            const retryData = await webview.executeJavaScript(jsCode, true);
                            console.log('[FinancePlugin] 重试后数据:', retryData);
                            if (Array.isArray(retryData) && retryData.length > 0) {
                                handleSuccess(retryData);
                            } else {
                                handleError(new Error('未获取到数据，页面可能未正确加载'));
                            }
                        } catch (retryError) {
                            handleError(new Error('重试获取数据失败: ' + retryError));
                        }
                    }
                } catch (e) {
                    handleError(e as Error);
                }
            });

            webview.addEventListener('did-fail-load', (event: any) => {
                handleError(new Error(`页面加载失败: ${event.errorDescription}`));
            });

            this.webviewContainer.appendChild(webview);
        });
    }

    /**
     * 获取指定日期和品种的数据文件路径
     * 格式: 人民币账户黄金/20260323.json
     */
    private getDataFilePath(metalName: string, date: string): string {
        // date 格式: 2026-03-23 -> 20260323
        const formattedDate = date.replace(/-/g, '');
        return `${metalName}/${formattedDate}.json`;
    }

    /**
     * 添加价格记录（按天存储）
     * 只有启用的品种才会存储
     */
    private async addPriceRecord(metalName: string, record: PriceRecord) {
        // 检查品种是否启用，未启用则不存储
        const config = this.settings?.metals?.[metalName];
        if (!config?.enabled) {
            console.log(`[FinancePlugin] ${metalName} 未启用，跳过存储`);
            return;
        }

        const filePath = this.getDataFilePath(metalName, record.date);

        // 加载当天现有数据
        const data = await this.loadData(filePath);
        let records: PriceRecord[] = data?.records || [];

        // 添加新记录
        records.push(record);

        // 保存数据（不限制条数）
        await this.saveData(filePath, { records });
        console.log(`[FinancePlugin] 已保存 ${metalName} ${record.date} 的数据，共 ${records.length} 条`);
    }

    /**
     * 获取指定品种的历史数据（最近30天）
     */
    async getMetalHistory(metalName: string): Promise<PriceRecord[]> {
        const allRecords: PriceRecord[] = [];
        
        // 获取最近30天的日期
        const dates = this.getLast30Days();
        
        // 加载每一天的数据
        for (const date of dates) {
            const filePath = this.getDataFilePath(metalName, date);
            const data = await this.loadData(filePath);
            if (data?.records && Array.isArray(data.records)) {
                allRecords.push(...data.records);
            }
        }

        // 按时间戳排序
        allRecords.sort((a, b) => a.timestamp - b.timestamp);

        console.log(`[FinancePlugin] 加载 ${metalName} 历史数据，共 ${allRecords.length} 条`);
        return allRecords;
    }

    /**
     * 获取最近30天的日期列表（格式: 2026-03-23）
     */
    private getLast30Days(): string[] {
        const dates: string[] = [];
        const today = new Date();
        
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = date.toISOString().split('T')[0]; // 格式: 2026-03-23
            dates.push(dateStr);
        }
        
        return dates;
    }

    /**
     * 清空指定品种的历史数据
     */
    async clearMetalHistory(metalName: string) {
        // 获取最近30天的日期并删除对应文件
        const dates = this.getLast30Days();
        for (const date of dates) {
            const filePath = this.getDataFilePath(metalName, date);
            await this.saveData(filePath, { records: [] });
        }
        this.lastPrices.delete(metalName);
        this.lastAlertDates.delete(metalName);
        console.log(`[FinancePlugin] 已清空 ${metalName} 的历史数据`);
    }

    /**
     * 清空所有历史数据
     */
    async clearAllHistory() {
        for (const metalName of METAL_TYPES) {
            await this.clearMetalHistory(metalName);
        }
    }

    /**
     * 检查预警条件
     */
    private async checkAlerts(metalName: string, currentPrice: number, record: PriceRecord) {
        const config = this.settings?.metals?.[metalName];
        if (!config) return;

        const notifications: AlertNotification[] = [];
        const today = record.date;
        const lastAlertKey = `${metalName}_daily`;
        const dailyAlertSentToday = this.lastAlertDates.get(lastAlertKey) === today;
        const lastPrice = this.lastPrices.get(metalName);

        // 1. 检查价格涨到多少（支持多个价格阈值，用逗号分隔）
        if (config.priceAbove) {
            const prices = this.parseMultiPrice(config.priceAbove);
            for (const targetPrice of prices) {
                if (currentPrice >= targetPrice) {
                    if (!lastPrice || lastPrice < targetPrice) {
                        notifications.push({
                            type: 'priceAbove',
                            productName: metalName,
                            currentPrice,
                            targetPrice: targetPrice,
                            message: `${metalName}价格涨至 ${currentPrice.toFixed(2)}，已超过设定值 ${targetPrice}`,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // 2. 检查价格跌到多少（支持多个价格阈值，用逗号分隔）
        if (config.priceBelow) {
            const prices = this.parseMultiPrice(config.priceBelow);
            for (const targetPrice of prices) {
                if (currentPrice <= targetPrice) {
                    if (!lastPrice || lastPrice > targetPrice) {
                        notifications.push({
                            type: 'priceBelow',
                            productName: metalName,
                            currentPrice,
                            targetPrice: targetPrice,
                            message: `${metalName}价格跌至 ${currentPrice.toFixed(2)}，已低于设定值 ${targetPrice}`,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // 3. 检查当天涨跌幅
        if (config.dailyChangePercent && !dailyAlertSentToday) {
            const changePercent = Math.abs(record.changePercent);
            if (changePercent >= config.dailyChangePercent) {
                const direction = record.changePercent > 0 ? '上涨' : '下跌';
                notifications.push({
                    type: 'dailyChange',
                    productName: metalName,
                    currentPrice,
                    percent: record.changePercent,
                    message: `${metalName}当天已${direction} ${changePercent.toFixed(2)}%，超过设定值 ${config.dailyChangePercent}%`,
                    timestamp: Date.now()
                });
                this.lastAlertDates.set(lastAlertKey, today);
            }
        }

        // 4. 检查比上次涨幅
        if (config.changePercent && lastPrice && lastPrice > 0) {
            const changePercent = ((currentPrice - lastPrice) / lastPrice) * 100;
            if (Math.abs(changePercent) >= config.changePercent) {
                const direction = changePercent > 0 ? '上涨' : '下跌';
                notifications.push({
                    type: 'changePercent',
                    productName: metalName,
                    currentPrice,
                    percent: changePercent,
                    message: `${metalName}价格${direction} ${Math.abs(changePercent).toFixed(2)}%，超过设定值 ${config.changePercent}%`,
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
     * 发送通知
     */
    private async sendAlertNotification(notification: AlertNotification) {
        const title = `⚠️ ${notification.productName} - 价格预警`;
        const body = notification.message;

        try {
            await sendNotification(title, body);
            console.log(`[FinancePlugin] 通知已发送: ${title} - ${body}`);
        } catch (e) {
            console.error(`[FinancePlugin] 发送通知失败:`, e);
            showMessage(`${title}\n${body}`, 5000, "error");
        }
    }

    /**
     * 解析多价格字符串（支持英文逗号和中文逗号）
     */
    private parseMultiPrice(priceStr: string | number): number[] {
        if (!priceStr) return [];
        if (typeof priceStr === 'number') {
            return priceStr > 0 ? [priceStr] : [];
        }
        return priceStr
            .split(/[,，]/)
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p) && p > 0);
    }

    /**
     * 加载设置
     */
    async loadSettings(update: boolean = false): Promise<FinanceSettings> {
        if (!update && this.settings) {
            return this.settings;
        }

        const settings = await this.loadData(SETTINGS_FILE);
        // 深度合并默认设置和保存的设置
        this.settings = this.mergeDeep(DEFAULT_SETTINGS, settings || {});
        return this.settings;
    }

    /**
     * 深度合并对象
     */
    private mergeDeep(target: any, source: any): any {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    private isObject(item: any): boolean {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * 保存设置
     */
    async saveSettings(settings: FinanceSettings) {
        this.settings = settings;
        await this.saveData(SETTINGS_FILE, settings);
    }

    /**
     * 获取当前价格数据
     */
    getCurrentPrices(): Map<string, MetalDataItem> {
        return this.currentPrices;
    }

    /**
     * 手动触发查询
     */
    async manualQuery(): Promise<void> {
        const hasEnabled = Object.values(this.settings?.metals || {}).some(m => m.enabled);
        if (!hasEnabled) {
            showMessage("请先启用至少一个贵金属品种", 3000, "error");
            throw new Error("没有启用的品种");
        }

        showMessage("正在查询最新数据...", 2000);
        await this.queryAllMetals();
        showMessage("查询完成", 2000);
    }

    /**
     * 更新指定品种的设置
     */
    async updateMetalConfig(metalName: string, config: MetalConfig) {
        if (!this.settings) {
            await this.loadSettings(true);
        }
        if (this.settings) {
            this.settings.metals[metalName] = config;
            await this.saveSettings(this.settings);
        }
    }
}
