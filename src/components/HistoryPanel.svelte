<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { Dialog, showMessage } from 'siyuan';
    import * as echarts from 'echarts';
    import type { PriceRecord, FinanceSettings } from '../types';

    export let plugin: any;
    export let onClose: () => void;

    let settings: FinanceSettings | null = null;
    let loading = false;
    let autoRefresh: number | null = null;
    let historyData: PriceRecord[] = [];

    // 图表配置
    let chartTimeRange: '1d' | '7d' | '30d' | 'all' = '1d';
    let chartContainer: HTMLDivElement;
    let chartInstance: echarts.ECharts | null = null;

    // 刷新历史数据
    function refreshHistoryData() {
        const data = plugin?.getHistoryData?.();
        historyData = Array.isArray(data) ? data : [];
    }
    $: filteredData = filterDataByTimeRange(historyData, chartTimeRange);
    $: priceStats = calculateStats(filteredData);
    $: latestRecord = historyData.length > 0 ? historyData[historyData.length - 1] : null;
    $: historyDataCount = historyData.length;

    // 当过滤数据变化时更新图表
    $: if (chartInstance && filteredData) {
        updateChart();
    }

    function filterDataByTimeRange(data: PriceRecord[], range: string): PriceRecord[] {
        if (!data.length) return [];
        
        const now = Date.now();
        const ranges: Record<string, number> = {
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': Infinity
        };
        
        const cutoff = now - (ranges[range] || ranges['7d']);
        return data.filter(r => r.timestamp > cutoff);
    }

    function calculateStats(data: PriceRecord[]) {
        if (!data.length) return null;
        
        const prices = data.map(d => d.midprice);
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;
        
        return { max, min, avg, first, last, change };
    }

    function formatPrice(price: number): string {
        return price?.toFixed(2) || '--';
    }

    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    // 格式化多价格显示（逗号分隔，超出容器自动缩略）
    function formatMultiPrice(priceStr: string | number): string {
        if (!priceStr) return '';
        // 兼容旧数据格式（数字类型）
        if (typeof priceStr === 'number') {
            return priceStr.toString();
        }
        const prices = priceStr.split(/[,，]/).map(p => p.trim()).filter(p => p);
        if (prices.length === 0) return '';
        if (prices.length === 1) return prices[0];
        // 多个价格用逗号分隔显示，超出容器会自动缩略
        return prices.join(', ');
    }

    // 打开预警设置编辑对话框
    function openAlertEditDialog() {
        if (!settings) return;

        const dialog = new Dialog({
            title: '设置预警',
            content: `
                <div class="b3-dialog__content" style="padding: 20px;">
                    <div style="margin-bottom: 16px; font-size: 12px; color: var(--b3-theme-on-surface);">
                        支持用英文逗号(,)或中文逗号(，)分隔多个价格
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格上涨至</label>
                        <input class="b3-text-field fn__block" type="text" id="priceAboveInput" 
                            placeholder="如：950, 960, 970"
                            value="${settings.goldPriceAbove || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≥ 设定值时提醒（支持多个价格，用逗号分隔）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格下跌至</label>
                        <input class="b3-text-field fn__block" type="text" id="priceBelowInput" 
                            placeholder="如：900, 880, 850"
                            value="${settings.goldPriceBelow || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            价格 ≤ 设定值时提醒（支持多个价格，用逗号分隔）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">日涨跌幅超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="dailyChangeInput" 
                            placeholder="如：3" step="0.1"
                            value="${settings.goldDailyChangePercent || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            当天上涨或下跌超过设定百分比时提醒（每日只通知一次）
                        </div>
                    </div>
                    
                    <div class="b3-form__item" style="margin-bottom: 16px;">
                        <label class="b3-form__label">价格变化超 (%)</label>
                        <input class="b3-text-field fn__block" type="number" id="changePercentInput" 
                            placeholder="如：2" step="0.1"
                            value="${settings.goldChangePercent || ''}">
                        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-top: 4px;">
                            相比上次查询变化超过设定百分比时提醒
                        </div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="cancelAlertBtn">取消</button>
                    <button class="b3-button b3-button--primary" id="saveAlertBtn">保存</button>
                </div>
            `,
            width: '450px'
        });

        const priceAboveInput = dialog.element.querySelector('#priceAboveInput') as HTMLInputElement;
        const priceBelowInput = dialog.element.querySelector('#priceBelowInput') as HTMLInputElement;
        const dailyChangeInput = dialog.element.querySelector('#dailyChangeInput') as HTMLInputElement;
        const changePercentInput = dialog.element.querySelector('#changePercentInput') as HTMLInputElement;
        const saveBtn = dialog.element.querySelector('#saveAlertBtn') as HTMLButtonElement;
        const cancelBtn = dialog.element.querySelector('#cancelAlertBtn') as HTMLButtonElement;

        // 保存按钮
        saveBtn.addEventListener('click', async () => {
            const priceAbove = priceAboveInput.value.trim();
            const priceBelow = priceBelowInput.value.trim();
            const dailyChange = parseFloat(dailyChangeInput.value);
            const changePercent = parseFloat(changePercentInput.value);

            // 验证价格格式
            if (priceAbove && !validateMultiPrice(priceAbove)) {
                showMessage('价格上涨值格式错误', 3000, 'error');
                return;
            }
            if (priceBelow && !validateMultiPrice(priceBelow)) {
                showMessage('价格下跌值格式错误', 3000, 'error');
                return;
            }

            // 更新设置
            settings.goldPriceAbove = priceAbove || '';
            settings.goldPriceBelow = priceBelow || '';
            settings.goldDailyChangePercent = isNaN(dailyChange) || dailyChange <= 0 ? 0 : dailyChange;
            settings.goldChangePercent = isNaN(changePercent) || changePercent <= 0 ? 0 : changePercent;

            // 保存到插件
            try {
                await plugin.saveSettings(settings);
                showMessage('预警设置已保存', 2000);
                await loadData(); // 刷新显示
            } catch (e) {
                showMessage('保存失败: ' + e, 3000, 'error');
            }

            dialog.destroy();
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            dialog.destroy();
        });
    }

    // 验证多价格格式
    function validateMultiPrice(priceStr: string): boolean {
        if (!priceStr) return true;
        const prices = priceStr.split(/[,，]/).map(p => p.trim()).filter(p => p);
        for (const price of prices) {
            const num = parseFloat(price);
            if (isNaN(num) || num <= 0) {
                return false;
            }
        }
        return true;
    }

    // 初始化 ECharts
    function initChart() {
        if (!chartContainer) return;
        
        chartInstance = echarts.init(chartContainer);
        updateChart();
        
        // 响应窗口大小变化
        window.addEventListener('resize', handleResize);
    }

    // 销毁图表
    function destroyChart() {
        window.removeEventListener('resize', handleResize);
        if (chartInstance) {
            chartInstance.dispose();
            chartInstance = null;
        }
    }

    function handleResize() {
        chartInstance?.resize();
    }

    // 更新图表数据
    function updateChart() {
        if (!chartInstance || !filteredData.length) return;

        const color = '#d4a951'; // 曲线颜色
        
        const dates = filteredData.map(d => formatDate(d.timestamp));
        const prices = filteredData.map(d => d.midprice);
        

        const option: echarts.EChartsOption = {
            backgroundColor: 'transparent',
            grid: {
                top: 40,
                left: 60,
                right: 40,
                bottom: 60
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'var(--b3-theme-surface)',
                borderColor: 'var(--b3-border-color)',
                textStyle: {
                    color: 'var(--b3-theme-on-background)'
                },
                formatter: (params: any) => {
                    const data = filteredData[params[0].dataIndex];
                    return `
                        <div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>
                        <div>中间价: <span style="color:${color};font-weight:600">${data.midprice.toFixed(2)}</span></div>
                        <div>买入: ${data.buyprice.toFixed(2)} | 卖出: ${data.sellprice.toFixed(2)}</div>
                        <div>最高: ${data.maxprice.toFixed(2)} | 最低: ${data.minprice.toFixed(2)}</div>
                    `;
                }
            },
            dataZoom: [
                {
                    type: 'inside',
                    start: 0,
                    end: 100
                },
                {
                    type: 'slider',
                    show: true,
                    bottom: 10,
                    height: 20,
                    borderColor: 'var(--b3-border-color)',
                    fillerColor: 'var(--b3-theme-primary-light)',
                    handleStyle: {
                        color: 'var(--b3-theme-primary)'
                    },
                    textStyle: {
                        color: 'var(--b3-theme-on-surface)'
                    }
                }
            ],
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: {
                    lineStyle: { color: 'var(--b3-border-color)' }
                },
                axisLabel: {
                    color: 'var(--b3-theme-on-surface)',
                    rotate: 45,
                    interval: Math.floor(dates.length / 6)
                }
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: {
                    lineStyle: { color: 'var(--b3-border-color)' }
                },
                axisLabel: {
                    color: 'var(--b3-theme-on-surface)'
                },
                splitLine: {
                    lineStyle: {
                        color: 'var(--b3-border-color)',
                        type: 'dashed'
                    }
                }
            },
            series: [
                {
                    name: '中间价',
                    type: 'line',
                    data: prices,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: {
                        color: color,
                        width: 2
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(212, 169, 81, 0.3)' },
                            { offset: 1, color: 'rgba(212, 169, 81, 0.05)' }
                        ])
                    },
                    markPoint: {
                        data: [
                            {
                                type: 'max',
                                name: '最高',
                                itemStyle: { color: '#ff4d4f' }, // 红色
                                label: {
                                    formatter: '{c}'
                                }
                            },
                            {
                                type: 'min',
                                name: '最低',
                                itemStyle: { color: '#52c41a' }, // 绿色
                                label: {
                                    formatter: '{c}'
                                }
                            }
                        ]
                    }
                },

            ]
        };

        chartInstance.setOption(option);
    }

    async function loadData() {
        loading = true;
        try {
            settings = await plugin.loadSettings();
        } catch (e) {
            showMessage('加载设置失败: ' + e);
        } finally {
            // 无论设置加载成功与否，都刷新历史数据
            refreshHistoryData();
            loading = false;
        }
    }

    function startAutoRefresh() {
        if (autoRefresh) clearInterval(autoRefresh);
        autoRefresh = window.setInterval(() => {
            // 刷新设置和历史数据
            loadData();
            // 额外刷新历史数据以确保数据最新
            refreshHistoryData();
        }, 30000); // 每30秒刷新一次
    }

    onMount(() => {
        // 先刷新历史数据（同步操作，确保初始数据加载）
        refreshHistoryData();
        loadData();
        startAutoRefresh();
        // 延迟初始化图表，确保DOM已准备好
        setTimeout(initChart, 100);
    });

    // 手动查询
    async function manualQuery() {
        loading = true;
        try {
            await plugin.manualQuery();
            // 查询完成后刷新历史数据
            refreshHistoryData();
            // 强制刷新图表
            if (chartInstance) {
                updateChart();
            }
            showMessage('查询完成', 2000);
        } catch (e) {
            showMessage('查询失败: ' + e, 3000, 'error');
        } finally {
            loading = false;
        }
    }

    onDestroy(() => {
        if (autoRefresh) clearInterval(autoRefresh);
        destroyChart();
    });

    // 打开插件设置
    function openPluginSetting() {
        plugin.openSetting?.();
    }
</script>

<div class="finance-history-panel">
    <div class="panel-header">
        <h2>📈 理财数据监控</h2>
        <div class="header-controls">
            <button class="b3-button b3-button--primary" on:click={manualQuery} disabled={loading}>
                {loading ? '查询中...' : '🔍 立即查询'}
            </button>
            <button class="b3-button b3-button--outline" on:click={loadData} disabled={loading}>
                刷新
            </button>
            <button class="b3-button b3-button--outline" on:click={openPluginSetting}>
                ⚙️ 设置
            </button>
            <button class="b3-button b3-button--text" on:click={onClose}>关闭</button>
        </div>
    </div>

    <div class="panel-content">
        <div class="sidebar">
            <div class="section">
                <h3>数据概览</h3>
                <div class="api-status">
                    <div class="status-row">
                        <span class="status-label">API状态:</span>
                        <span class="status-value" class:enabled={settings?.goldEnabled}>
                            {settings?.goldEnabled ? '✓ 已启用' : '✗ 已禁用'}
                        </span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">自动查询:</span>
                        <span class="status-value" class:enabled={settings?.autoQuery}>
                            {settings?.autoQuery ? '✓ 已开启' : '✗ 已关闭'}
                        </span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">数据条数:</span>
                        <span class="status-value">{historyData.length}</span>
                    </div>
                </div>
            </div>

            <div class="section alert-section">
                <div class="alert-header-row">
                    <h3>⚠️ 预警设置</h3>
                    {#if settings}
                        <button class="edit-alert-btn" on:click={openAlertEditDialog}>编辑</button>
                    {/if}
                </div>
                {#if settings}
                    {#if settings.goldPriceAbove}
                        <div class="alert-item">
                            <span class="alert-label">价格上涨至:</span>
                            <span class="alert-value above" title={settings.goldPriceAbove}>{formatMultiPrice(settings.goldPriceAbove)}</span>
                        </div>
                    {/if}
                    {#if settings.goldPriceBelow}
                        <div class="alert-item">
                            <span class="alert-label">价格下跌至:</span>
                            <span class="alert-value below" title={settings.goldPriceBelow}>{formatMultiPrice(settings.goldPriceBelow)}</span>
                        </div>
                    {/if}
                    {#if settings.goldDailyChangePercent}
                        <div class="alert-item">
                            <span class="alert-label">日涨跌幅超:</span>
                            <span class="alert-value drop">{settings.goldDailyChangePercent}%</span>
                        </div>
                    {/if}
                    {#if settings.goldChangePercent}
                        <div class="alert-item">
                            <span class="alert-label">价格变化超:</span>
                            <span class="alert-value change">{settings.goldChangePercent}%</span>
                        </div>
                    {/if}
                    {#if !settings.goldPriceAbove && !settings.goldPriceBelow && !settings.goldDailyChangePercent && !settings.goldChangePercent}
                        <div class="alert-empty">暂无预警设置<br>点击"编辑"按钮添加</div>
                    {/if}
                {:else}
                    <div class="alert-empty">加载中...</div>
                {/if}
            </div>

            <div class="section">
                <h3>当前价格</h3>
                {#if latestRecord}
                    <div class="current-price">
                        <div class="price-main">{formatPrice(latestRecord.midprice)}</div>
                        <div class="price-time">{latestRecord.date} {latestRecord.time}</div>
                    </div>
                {:else}
                    <div class="no-data-tip">暂无数据</div>
                {/if}
            </div>
        </div>

        <div class="main-content">
            {#if historyData.length}
                <div class="stats-cards">
                    <div class="stat-card">
                        <div class="stat-label">最新价格</div>
                        <div class="stat-value">{formatPrice(latestRecord?.midprice || 0)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">最高价</div>
                        <div class="stat-value high">{formatPrice(priceStats?.max || 0)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">最低价</div>
                        <div class="stat-value low">{formatPrice(priceStats?.min || 0)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">区间涨跌</div>
                        <div class="stat-value" class:up={priceStats && priceStats.change > 0} class:down={priceStats && priceStats.change < 0}>
                            {priceStats ? (priceStats.change > 0 ? '+' : '') + priceStats.change.toFixed(2) : 0}%
                        </div>
                    </div>
                </div>

                <div class="chart-section">
                    <div class="chart-header">
                        <h3>人民币账户黄金 - 价格走势</h3>
                        <div class="time-range">
                            {#each [['1d', '1天'], ['7d', '7天'], ['30d', '30天'], ['all', '全部']] as [range, label]}
                                <button 
                                    class="range-btn" 
                                    class:active={chartTimeRange === range}
                                    on:click={() => chartTimeRange = range}
                                >
                                    {label}
                                </button>
                            {/each}
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        {#if filteredData.length > 1}
                            <div class="echarts-container" bind:this={chartContainer}></div>
                        {:else}
                            <div class="no-data">数据不足，无法绘制图表</div>
                        {/if}
                    </div>
                </div>

                <div class="data-table-section">
                    <h3>历史数据</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>时间</th>
                                    <th>中间价</th>
                                    <th>买入价</th>
                                    <th>卖出价</th>
                                    <th>最高价</th>
                                    <th>最低价</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each [...historyData].reverse().slice(0, 50) as record}
                                    <tr>
                                        <td>{record.date} {record.time}</td>
                                        <td class="price">{formatPrice(record.midprice)}</td>
                                        <td>{formatPrice(record.buyprice)}</td>
                                        <td>{formatPrice(record.sellprice)}</td>
                                        <td class="high">{formatPrice(record.maxprice)}</td>
                                        <td class="low">{formatPrice(record.minprice)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>暂无数据，请等待下次自动查询或点击"立即查询"</p>
                    {#if !settings?.goldEnabled}
                        <p class="empty-hint">提示：请在设置中启用黄金API并配置appkey</p>
                    {:else if !settings?.goldAppkey}
                        <p class="empty-hint">提示：请在设置中配置API密钥(appkey)</p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    .finance-history-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--b3-border-color);
        
        h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        .header-controls {
            display: flex;
            gap: 8px;
        }
    }

    .panel-content {
        display: flex;
        flex: 1;
        overflow: hidden;
    }

    .sidebar {
        width: 220px;
        padding: 16px;
        border-right: 1px solid var(--b3-border-color);
        overflow-y: auto;
        flex-shrink: 0;
        
        .section {
            margin-bottom: 20px;
            
            h3 {
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 10px 0;
                color: var(--b3-theme-on-surface);
            }
        }
        
        .api-status {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;
            
            .status-row {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px dashed var(--b3-border-color);
                font-size: 13px;
                
                &:last-child {
                    border-bottom: none;
                }
                
                .status-label {
                    color: var(--b3-theme-on-surface);
                }
                
                .status-value {
                    font-weight: 500;
                    
                    &.enabled {
                        color: #52c41a;
                    }
                    
                    &:not(.enabled) {
                        color: #ff4d4f;
                    }
                }
            }
        }
        
        .alert-section {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;
            
            .alert-header-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                
                h3 {
                    margin: 0;
                }
                
                .edit-alert-btn {
                    padding: 4px 10px;
                    font-size: 12px;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 4px;
                    background: var(--b3-theme-background);
                    cursor: pointer;
                    color: var(--b3-theme-on-background);
                    
                    &:hover {
                        border-color: var(--b3-theme-primary);
                        color: var(--b3-theme-primary);
                    }
                }
            }
            
            .alert-item {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px dashed var(--b3-border-color);
                font-size: 12px;
                
                &:last-child {
                    border-bottom: none;
                }
                
                .alert-label {
                    color: var(--b3-theme-on-surface);
                    flex-shrink: 0;
                }
                
                .alert-value {
                    font-weight: 600;
                    margin-left: 8px;
                    text-align: right;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 100px;
                    
                    &.above { color: #52c41a; }
                    &.below { color: #ff4d4f; }
                    &.drop { color: #fa8c16; }
                    &.change { color: #1890ff; }
                }
            }
            
            .alert-empty {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                text-align: center;
                padding: 12px 0;
                line-height: 1.6;
            }
        }
        
        .current-price {
            background: var(--b3-theme-surface);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
            
            .price-main {
                font-size: 28px;
                font-weight: 700;
                color: var(--b3-theme-primary);
                margin-bottom: 4px;
            }
            
            .price-time {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
            }
        }
        
        .no-data-tip {
            font-size: 13px;
            color: var(--b3-theme-on-surface);
            text-align: center;
            padding: 16px;
        }
    }

    .main-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        min-width: 0;
    }

    .stats-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
        
        .stat-card {
            background: var(--b3-theme-surface);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
            
            .stat-label {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                margin-bottom: 8px;
            }
            
            .stat-value {
                font-size: 24px;
                font-weight: 700;
                
                &.high { color: #ff4d4f; }
                &.low { color: #52c41a; }
                &.up { color: #52c41a; }
                &.down { color: #ff4d4f; }
            }
        }
    }

    .chart-section {
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 24px;
        
        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            
            h3 {
                margin: 0;
                font-size: 16px;
            }
            
            .time-range {
                display: flex;
                gap: 8px;
                
                .range-btn {
                    padding: 4px 12px;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 4px;
                    background: var(--b3-theme-background);
                    cursor: pointer;
                    font-size: 12px;
                    
                    &.active {
                        background: var(--b3-theme-primary);
                        color: white;
                        border-color: var(--b3-theme-primary);
                    }
                }
            }
        }
        
        .chart-container {
            .echarts-container {
                width: 100%;
                height: 320px;
            }
            
            .no-data {
                height: 320px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--b3-theme-on-surface);
            }
        }
    }

    .data-table-section {
        h3 {
            font-size: 16px;
            margin: 0 0 12px 0;
        }
        
        .table-container {
            background: var(--b3-theme-surface);
            border-radius: 8px;
            overflow: hidden;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            
            th, td {
                padding: 10px 12px;
                text-align: left;
                border-bottom: 1px solid var(--b3-border-color);
            }
            
            th {
                background: var(--b3-theme-background);
                font-weight: 600;
                position: sticky;
                top: 0;
            }
            
            .price {
                font-weight: 600;
                color: var(--b3-theme-primary);
            }
            
            .high { color: #ff4d4f; }
            .low { color: #52c41a; }
        }
    }

    .empty-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface);
        
        .empty-icon {
            font-size: 64px;
            margin-bottom: 16px;
        }
        
        p {
            font-size: 16px;
            margin: 0 0 8px 0;
        }
        
        .empty-hint {
            font-size: 13px;
            color: var(--b3-theme-on-surface);
            opacity: 0.8;
        }
    }
</style>
