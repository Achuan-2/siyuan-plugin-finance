<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { Dialog, showMessage } from 'siyuan';
    import type { ApiConfig, PriceRecord, AlertRule } from '../types';

    export let plugin: any;
    export let onClose: () => void;

    let apiConfigs: ApiConfig[] = [];
    let selectedApiId: string = '';
    let selectedProduct: string = '';
    let loading = false;
    let autoRefresh: number | null = null;

    // 图表配置
    let chartTimeRange: '1d' | '7d' | '30d' | 'all' = '7d';

    $: selectedApi = apiConfigs.find(a => a.id === selectedApiId);
    $: products = selectedApi ? selectedApi.productTypes : [];
    $: historyData = selectedApi && selectedProduct 
        ? (selectedApi.historyData[selectedProduct] || []) 
        : [];
    $: filteredData = filterDataByTimeRange(historyData, chartTimeRange);
    $: priceStats = calculateStats(filteredData);
    $: alertRule = selectedApi && selectedProduct 
        ? (selectedApi.alertRules[selectedProduct] || {})
        : {};

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

    function getChartPath(data: PriceRecord[]): string {
        if (!data.length) return '';
        
        const prices = data.map(d => d.midprice);
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        const range = max - min || 1;
        
        const width = 600;
        const height = 200;
        const padding = 20;
        
        const points = data.map((d, i) => {
            const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
            const y = height - padding - ((d.midprice - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        }).join(' ');
        
        return points;
    }

    function formatPrice(price: number): string {
        return price.toFixed(2);
    }

    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    async function loadData() {
        loading = true;
        try {
            const settings = await plugin.loadSettings();
            apiConfigs = settings.apiConfigs || [];
            
            if (apiConfigs.length && !selectedApiId) {
                selectedApiId = apiConfigs[0].id;
                if (apiConfigs[0].productTypes.length) {
                    selectedProduct = apiConfigs[0].productTypes[0];
                }
            }
        } catch (e) {
            showMessage('加载数据失败: ' + e);
        } finally {
            loading = false;
        }
    }

    function startAutoRefresh() {
        if (autoRefresh) clearInterval(autoRefresh);
        autoRefresh = window.setInterval(() => {
            loadData();
        }, 30000); // 每30秒刷新一次
    }

    onMount(() => {
        loadData();
        startAutoRefresh();
    });

    onDestroy(() => {
        if (autoRefresh) clearInterval(autoRefresh);
    });
</script>

<div class="finance-history-panel">
    <div class="panel-header">
        <h2>📈 理财数据监控</h2>
        <div class="header-controls">
            <button class="b3-button b3-button--outline" on:click={loadData} disabled={loading}>
                {loading ? '加载中...' : '刷新'}
            </button>
            <button class="b3-button b3-button--text" on:click={onClose}>关闭</button>
        </div>
    </div>

    <div class="panel-content">
        <div class="sidebar">
            <div class="section">
                <h3>选择接口</h3>
                <select class="b3-select" bind:value={selectedApiId}>
                    {#each apiConfigs as api}
                        <option value={api.id}>{api.name} {api.enabled ? '✓' : '✗'}</option>
                    {/each}
                </select>
            </div>

            {#if products.length}
            <div class="section">
                <h3>选择产品</h3>
                <div class="product-list">
                    {#each products as product}
                        <button 
                            class="product-btn" 
                            class:active={selectedProduct === product}
                            on:click={() => selectedProduct = product}
                        >
                            {product}
                        </button>
                    {/each}
                </div>
            </div>
            {/if}

            {#if alertRule && Object.keys(alertRule).length}
            <div class="section alert-section">
                <h3>⚠️ 预警设置</h3>
                {#if alertRule.priceAbove}
                    <div class="alert-item">
                        <span class="alert-label">价格上涨至:</span>
                        <span class="alert-value above">{alertRule.priceAbove}</span>
                    </div>
                {/if}
                {#if alertRule.priceBelow}
                    <div class="alert-item">
                        <span class="alert-label">价格下跌至:</span>
                        <span class="alert-value below">{alertRule.priceBelow}</span>
                    </div>
                {/if}
                {#if alertRule.dailyDropPercent}
                    <div class="alert-item">
                        <span class="alert-label">日跌幅超:</span>
                        <span class="alert-value drop">{alertRule.dailyDropPercent}%</span>
                    </div>
                {/if}
                {#if alertRule.changePercent}
                    <div class="alert-item">
                        <span class="alert-label">变化幅度超:</span>
                        <span class="alert-value change">{alertRule.changePercent}%</span>
                    </div>
                {/if}
            </div>
            {/if}
        </div>

        <div class="main-content">
            {#if selectedProduct && historyData.length}
                <div class="stats-cards">
                    <div class="stat-card">
                        <div class="stat-label">当前价格</div>
                        <div class="stat-value">{formatPrice(priceStats?.last || 0)}</div>
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
                        <div class="stat-label">涨跌幅</div>
                        <div class="stat-value" class:up={priceStats && priceStats.change > 0} class:down={priceStats && priceStats.change < 0}>
                            {priceStats ? (priceStats.change > 0 ? '+' : '') + priceStats.change.toFixed(2) : 0}%
                        </div>
                    </div>
                </div>

                <div class="chart-section">
                    <div class="chart-header">
                        <h3>{selectedProduct} - 价格走势</h3>
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
                            <svg viewBox="0 0 600 200" class="price-chart">
                                <!-- 网格线 -->
                                <line x1="20" y1="20" x2="580" y2="20" stroke="var(--b3-border-color)" stroke-dasharray="2,2"/>
                                <line x1="20" y1="100" x2="580" y2="100" stroke="var(--b3-border-color)" stroke-dasharray="2,2"/>
                                <line x1="20" y1="180" x2="580" y2="180" stroke="var(--b3-border-color)" stroke-dasharray="2,2"/>
                                
                                <!-- 价格线 -->
                                <polyline 
                                    points={getChartPath(filteredData)}
                                    fill="none"
                                    stroke={priceStats && priceStats.change >= 0 ? '#52c41a' : '#ff4d4f'}
                                    stroke-width="2"
                                />
                                
                                <!-- 当前价格点 -->
                                {#if filteredData.length}
                                    {@const lastPoint = filteredData[filteredData.length - 1]}
                                    {@const prices = filteredData.map(d => d.midprice)}
                                    {@const max = Math.max(...prices)}
                                    {@const min = Math.min(...prices)}
                                    {@const range = max - min || 1}
                                    {@const x = 20 + ((filteredData.length - 1) / (filteredData.length - 1 || 1)) * 560}
                                    {@const y = 200 - 20 - ((lastPoint.midprice - min) / range) * 160}
                                    <circle cx={x} cy={y} r="4" fill="#1890ff"/>
                                {/if}
                            </svg>
                            <div class="chart-labels">
                                <span class="label-left">{formatDate(filteredData[0]?.timestamp || 0)}</span>
                                <span class="label-right">{formatDate(filteredData[filteredData.length - 1]?.timestamp || 0)}</span>
                            </div>
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
            {:else if !selectedProduct}
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>请选择接口和产品查看数据</p>
                </div>
            {:else}
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <p>暂无数据，请等待下次查询</p>
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
        
        .section {
            margin-bottom: 20px;
            
            h3 {
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 10px 0;
                color: var(--b3-theme-on-surface);
            }
        }
        
        .product-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .product-btn {
            padding: 8px 12px;
            text-align: left;
            border: 1px solid var(--b3-border-color);
            border-radius: 6px;
            background: var(--b3-theme-background);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            
            &:hover {
                border-color: var(--b3-theme-primary);
            }
            
            &.active {
                background: var(--b3-theme-primary);
                color: white;
                border-color: var(--b3-theme-primary);
            }
        }
        
        .alert-section {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 8px;
            
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
                }
                
                .alert-value {
                    font-weight: 600;
                    
                    &.above { color: #52c41a; }
                    &.below { color: #ff4d4f; }
                    &.drop { color: #fa8c16; }
                    &.change { color: #1890ff; }
                }
            }
        }
    }

    .main-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
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
                
                &.high { color: #52c41a; }
                &.low { color: #ff4d4f; }
                &.up { color: #52c41a; }
                &.down { color: #ff4d4f; }
            }
        }
    }

    .chart-section {
        background: var(--b3-theme-surface);
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
            .price-chart {
                width: 100%;
                height: 200px;
            }
            
            .chart-labels {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                margin-top: 8px;
            }
            
            .no-data {
                height: 200px;
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
            
            .high { color: #52c41a; }
            .low { color: #ff4d4f; }
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
        }
    }
</style>
