<template>
    <div class="container">
        <div class="toolbar" v-if="!props.readonly" style="width: 50%;">
            <div class="shape-templates">
                <h4>图形模板:</h4>
                <div class="template-buttons">
                    <button @click="addTemplate('rectangle')" title="矩形">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor"
                                stroke-width="2" />
                        </svg>
                    </button>
                    <button @click="addTemplate('triangle')" title="三角形">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <polygon points="12,2 22,22 2,22" fill="none" stroke="currentColor" stroke-width="2" />
                        </svg>
                    </button>
                    <button @click="addTemplate('circle')" title="圆形">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
                        </svg>
                    </button>
                </div>
            </div>
            <button @click="undo" :disabled="!canUndo" title="快捷键: Ctrl/Command + Z">
                撤销
            </button>
            <button @click="redo" :disabled="!canRedo" title="快捷键: Ctrl/Command + Shift + Z">
                重做
            </button>
            <button @click="clearShapes">清空图形</button>
            <button @click="downloadImage">下载图形</button>
            <div style="margin-top: 10px;">
                <button @click="alignShapes('left')" :disabled="!canAlign">左对齐</button>
                <button @click="alignShapes('center')" :disabled="!canAlign">居中对齐</button>
                <button @click="alignShapes('right')" :disabled="!canAlign">右对齐</button>
                <button @click="alignShapes('top')" :disabled="!canAlign">顶部对齐</button>
                <button @click="alignShapes('middle')" :disabled="!canAlign">垂直居中</button>
                <button @click="alignShapes('bottom')" :disabled="!canAlign">底部对齐</button>
            </div>
            <div class="submit">
                <label>公司名称:</label>
                <input v-model="company" placeholder="输入公司名称"  />
                <template v-if="drawingMode === 'unit' && currentAreaName">
                    <label class="grid-column-1">所属区域: {{ currentAreaName }}</label>
                </template>
                <label>{{ drawingMode === 'area' ? '区域名称:' : '单元名称:' }}</label>
                <input required v-model="polygonName" @change="drawChart"
                    :placeholder="`输入${drawingMode === 'area' ? '区域' : '单元'}名称`" />
                <label>{{ drawingMode === 'area' ? '区域颜色:' : '单元颜色:' }}</label>
                <div class="color-picker">
                    <div class="color-option" v-for="(color, index) in colors" :key="index"
                        :style="{ backgroundColor: color.value }" :class="{ active: selectedColor === color.value }"
                        @click="selectColor(color.value)" :title="color.label">
                    </div>
                </div>
                <button @click="saveShapes" type="submit">保存{{ drawingMode === 'area' ? '区域' : '单元' }}</button>
            </div>

            <div class="shortcuts-tips">
                <p>提示：</p>
                <ul>
                    <li>撤销：Ctrl/Command + Z</li>
                    <li>重做：Ctrl/Command + Shift + Z</li>
                    <li>删除多边形：点击已保存的多边形后使用Backspace/Delete</li>
                    <li>选择多边形：点击已保存的多边形进行单选 按住Ctrl/Command 进行多选</li>
                    <li>右键区域进入单元绘制</li>
                </ul>
            </div>
            <button @click="exportData" style="margin-top: 10px;">导出数据</button>

            <div class="mode-indicator">
                <span>当前模式: {{ drawingMode === 'area' ? '区域绘制' : '单元绘制' }}</span>
                <button v-if="drawingMode === 'unit'" @click="backToAreaMode">
                    返回区域绘制
                </button>
            </div>
        </div>

        <div class="view-div" v-if="readonly">
            <input v-model="company" placeholder="输入公司名称" />
            <button @click="downloadImage">下载图形</button>

            <div class="mode-indicator" v-if="drawingMode === 'unit'">
                <span>当前模式: 单元查看</span>
                <button @click="backToAreaMode">返回区域查看</button>
            </div>
        </div>

        <div @contextmenu.prevent ref="chartContainer" class="chart-container"></div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted, watch } from 'vue';
import './draw.css'
import * as d3 from 'd3';

const message = (title) => {
    Notification.requestPermission().then((permission) => {
        // 如果用户接受，我们就创建一个通知
        if (permission === "granted") {
            const notification = new Notification(title);
        }
    });
}


const MockShape = []

const chartContainer = ref(null);
const points = ref([]); // Stores the vertices of the polygon
const polygonName = ref(''); // Stores the name of the polygon
let drawing = false;

// Undo and redo stacks
const undoStack = ref([]);
const redoStack = ref([]);
const company = ref(null);

// 添加绘制状态管理
const drawingMode = ref('area'); // 'area' 或 'unit'
const currentAreaId = ref(null); // 当前选中的区域ID

// 修改数据结构
const savedPolygons = ref({
    areas: [],
    units: []
});

// 添加颜色选项
const colors = [
    { label: '低风险', value: '#1E90FF' },    // 蓝色
    { label: '一般风险', value: '#FFD700' },  // 黄色
    { label: '较大风险', value: '#FFA500' },  // 橘色
    { label: '重大风险', value: '#FF4500' },  // 红色
    { label: '停工停产', value: '#808080' }   // 灰色
];

// 当前选中的颜色
const selectedColor = ref(colors[0].value);

// 添加图例显示状态控制
const legendStatus = ref(colors.map(color => ({
    ...color,
    visible: true
})));

// 添加 props 定义
const props = defineProps({
    readonly: {
        type: Boolean,
        default: false
    }
});

// 添加选中状态追踪
const selectedPolygons = ref(new Set());

// 添加是否可以对齐的计算属性
const canAlign = computed(() => selectedPolygons.value.size > 1);

const gridSpacing = 20; // 网格间距
// 将坐标磁吸到最近的网格线
const snapToGrid = (value) => {
    return Math.round(value / gridSpacing) * gridSpacing;
};

const selectColor = (val) => {
    selectedColor.value = val;
    drawChart()
}

// 添加编辑状态管理
const editingPolygon = ref(null); // 当前正在编辑的多边形

// 修改 togglePolygonSelection 函数
const togglePolygonSelection = (index, event, type) => {
    if (props.readonly) return;

    event.stopPropagation();
    const selectionId = `${type}-${index}`;
    const isCorrectMode = (drawingMode.value === 'area' && type === 'area') ||
        (drawingMode.value === 'unit' && type === 'unit');

    if (!isCorrectMode) return;

    // 如果当前正在绘制新图形，提示用户先保存或清除当前图形
    if (points.value.length > 0) {
        message('请先保存或清除当前正在绘制的图形');
        return;
    }

    // 如果按住Ctrl/Command键，则切换选择状态
    if (event.ctrlKey || event.metaKey) {
        if (selectedPolygons.value.has(selectionId)) {
            selectedPolygons.value.delete(selectionId);
            if (editingPolygon.value?.selectionId === selectionId) {
                editingPolygon.value = null;
            }
        } else {
            selectedPolygons.value.add(selectionId);
        }
    } else {
        // 单选时，设置当前图形为编辑状态
        selectedPolygons.value.clear();
        selectedPolygons.value.add(selectionId);

        // 设置编辑状态
        const polygonArray = type === 'area' ? savedPolygons.value.areas : savedPolygons.value.units;
        const polygon = polygonArray[index];
        editingPolygon.value = {
            type,
            index,
            selectionId,
            ...polygon
        };

        // 更新表单数据
        polygonName.value = polygon.name;
        selectedColor.value = polygon.color;
    }

    drawChart();
};


const companySelect = val => {
    const { rows } = val;
    company.value = rows[0].text;
}

const resetCompany = () => {
    company.value = null;
}

watch(() => company.value, () => {
    drawChart();
})

// 添加变换状态存储
const currentTransform = ref(d3.zoomIdentity);

const drawChart = () => {
    console.log(chartContainer.value,)
    const width = window.innerWidth / 2 + 200;
    const height = chartContainer.value.getBoundingClientRect().height;

    // Clear container
    d3.select(chartContainer.value).selectAll('*').remove();

    // Create SVG element
    const svg = d3.select(chartContainer.value)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('border', '1px solid #ccc');

    // 添加一个主要的g元素作为所有内容的容器
    const mainGroup = svg.append('g');

    // 添加一个专门用于网格的图层
    const gridGroup = mainGroup.append('g').attr('class', 'grid-layer');
    // 添加一个专门用于图形的图层
    const shapesGroup = mainGroup.append('g').attr('class', 'shapes-layer');

    // 定义缩放行为
    const zoom = d3.zoom()
        .scaleExtent([0.3, 10])
        .on('zoom', (event) => {
            currentTransform.value = event.transform;
            mainGroup.attr('transform', event.transform);
            // 调整网格大小以适应缩放
            updateGrid(gridGroup, width, height, event.transform);

            // 更新比例尺指示器
            updateScaleIndicator(svg, event.transform);
        });

    // 应用缩放行为到SVG
    svg.call(zoom);

    // 恢复之前的变换状态
    svg.call(zoom.transform, currentTransform.value);

    if (!props.readonly && selectedPolygons.value.size === 0) {
        svg.on('click', function (event) {
            // 检查事件源，如果点击的是多边形或其他元素，则不添加新点
            if (event.target.tagName === 'polygon' || event.target.tagName === 'circle') {
                return;
            }

            if (!drawing) {
                drawing = true;
            }
            undoStack.value.push([...points.value]);
            redoStack.value = [];

            // 获取相对于shapes图层的坐标
            const coords = d3.pointer(event, shapesGroup.node());
            points.value.push([snapToGrid(coords[0]), snapToGrid(coords[1])]);
            updatePolygon(shapesGroup, svg); // 传入shapesGroup而不是mainGroup
        });
    }

    // 初始绘制网格
    updateGrid(gridGroup, width, height, d3.zoomIdentity);
    // 绘制图形
    updatePolygon(shapesGroup, svg);

    // 添加图例（不受缩放影响）
    addLegend(svg, height);

    // 添加缩放比例指示器
    const scaleIndicator = svg.append('g')
        .attr('class', 'scale-indicator')
        .attr('transform', `translate(${width - 80}, ${height - 30})`);

    scaleIndicator.append('rect')
        .attr('width', 70)
        .attr('height', 24)
        .attr('rx', 4)
        .attr('fill', 'rgba(255, 255, 255, 0.9)')
        .attr('stroke', '#ccc');

    scaleIndicator.append('text')
        .attr('class', 'scale-text')  // 添加类名以便更新
        .attr('x', 35)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', '12px')
        .text(`${Math.round(currentTransform.value.k * 100)}%`);
};

// 添加更新比例尺指示器的函数
const updateScaleIndicator = (svg, transform) => {
    svg.select('.scale-indicator .scale-text')
        .text(`${Math.round(transform.k * 100)}%`);
};

// 修改更新网格的函数
const updateGrid = (gridGroup, width, height, transform) => {
    gridGroup.selectAll('*').remove();

    // 计算网格的范围，考虑缩放和平移
    const gridSize = gridSpacing;
    // 扩大网格范围，确保覆盖整个可视区域
    const margin = Math.max(width, height); // 添加边距以确保覆盖

    const xStart = Math.floor((-transform.x - margin) / transform.k / gridSize) * gridSize;
    const yStart = Math.floor((-transform.y - margin) / transform.k / gridSize) * gridSize;
    const xEnd = Math.ceil((width / transform.k - transform.x + margin) / transform.k / gridSize) * gridSize;
    const yEnd = Math.ceil((height / transform.k - transform.y + margin) / transform.k / gridSize) * gridSize;

    // 绘制垂直线
    for (let x = xStart; x <= xEnd; x += gridSize) {
        gridGroup.append('line')
            .attr('x1', x)
            .attr('y1', yStart)
            .attr('x2', x)
            .attr('y2', yEnd)
            .style('stroke', '#ccc')
            .style('stroke-width', 0.5 / transform.k); // 调整线宽以适应缩放
    }

    // 绘制水平线
    for (let y = yStart; y <= yEnd; y += gridSize) {
        gridGroup.append('line')
            .attr('x1', xStart)
            .attr('y1', y)
            .attr('x2', xEnd)
            .attr('y2', y)
            .style('stroke', '#ccc')
            .style('stroke-width', 0.5 / transform.k); // 调整线宽以适应缩放
    }
};

// 新增添加图例的函数
const addLegend = (svg, height) => {
    // 创建一个独立的图例组，不受主图层的变换影响
    const legendGroup = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(20, ${height - 150})`);

    legendStatus.value.forEach((item, index) => {
        const legendItem = legendGroup.append('g')
            .attr('transform', `translate(0, ${index * 25})`)
            .style('cursor', 'pointer')
            .on('click', (event) => {
                event.stopPropagation();
                item.visible = !item.visible;
                drawChart();
            });

        legendItem.append('rect')
            .attr('width', 18)
            .attr('height', 18)
            .attr('fill', item.value)
            .style('opacity', item.visible ? 1 : 0.5);

        legendItem.append('text')
            .attr('x', 24)
            .attr('y', 14)
            .text(item.label)
            .style('font-size', '14px')
            .style('opacity', item.visible ? 1 : 0.5);
    });
};

// 修改updatePolygon函数，移除图例相关代码
const updatePolygon = (shapesGroup, svg) => {
    shapesGroup.selectAll('*').remove();

    const height = svg.node().getBoundingClientRect().height;
    const width = svg.node().getBoundingClientRect().width;

    // 根据绘制模式显示不同的内容
    if (drawingMode.value === 'area') {
        // 绘制所有区域
        savedPolygons.value.areas.forEach((polygon, index) => {
            if (!company.value || polygon.company !== company.value) return;
            drawPolygon(shapesGroup, polygon, index, 'area');
        });
    } else if (drawingMode.value === 'unit') {
        // 在单元模式下，先显示当前选中的区域作为背景
        const currentArea = savedPolygons.value.areas.find(area => area.id === currentAreaId.value);
        if (currentArea) {
            // 以半透明方式显示当前区域
            drawPolygon(shapesGroup, currentArea, -1, 'area', true);

            // 显示该区域下的所有单元
            savedPolygons.value.units
                .filter(unit => unit.areaId === currentAreaId.value)
                .forEach((unit, index) => {
                    drawPolygon(shapesGroup, unit, index, 'unit');
                });
        }
    }

    // 绘制当前正在绘制的多边形
    if (points.value.length > 0) {
        const currentLegendItem = legendStatus.value.find(item => item.value === selectedColor.value);
        if (currentLegendItem?.visible) {
            shapesGroup.append('polygon')
                .attr('points', points.value.map(d => d.join(',')).join(' '))
                .style('fill', selectedColor.value)
                .attr('stroke', 'black')
                .attr('stroke-width', 2);

            // Draw circles for each vertex and make them draggable
            shapesGroup.selectAll('circle')
                .data(points.value)
                .enter()
                .append('circle')
                .attr('cx', d => d[0])
                .attr('cy', d => d[1])
                .attr('r', 6)
                .attr('fill', 'yellow')
                .attr('stroke', 'black')
                .attr('stroke-width', 1)
                .call(
                    d3.drag()
                        .on('start', dragStarted)
                        .on('drag', dragged)
                        .on('end', dragEnded)
                );

            // Add the polygon name
            if (polygonName.value) {
                // Calculate the center of the polygon for placing the text
                const center = calculatePolygonCenter(points.value);
                shapesGroup.append('text')
                    .attr('x', center[0])
                    .attr('y', center[1])
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'black')
                    .attr('font-size', '14px')
                    .text(polygonName.value);
            }
        }
    }

    if (!props.readonly) {
        // 只在非只读模式下添加拖拽功能
        shapesGroup.selectAll('circle')
            .data(points.value)
            .enter()
            .append('circle')
            .attr('cx', d => d[0])
            .attr('cy', d => d[1])
            .attr('r', 10)
            .attr('fill', 'yellow')
            .attr('stroke', 'black')
            .attr('stroke-width', 1)
            .call(
                d3.drag()
                    .on('start', dragStarted)
                    .on('drag', dragged)
                    .on('end', dragEnded)
            );
        // 添加网格线

        for (let x = 0; x < width; x += gridSpacing) {
            shapesGroup.append('line')
                .attr('x1', x)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', height)
                .style('stroke', '#ccc')
                .style('stroke-width', 0.5);
        }
        for (let y = 0; y < height; y += gridSpacing) {
            shapesGroup.append('line')
                .attr('x1', 0)
                .attr('y1', y)
                .attr('x2', width)
                .attr('y2', y)
                .style('stroke', '#ccc')
                .style('stroke-width', 0.5);
        }
    }
};

// Drag event handlers
const dragStarted = (event, d) => {
    d3.select(event.sourceEvent.target).raise().classed('active', true);
    // 保存初始位置
    d.startPos = [...d];
    // 保存初始鼠标位置
    const svgNode = d3.select(chartContainer.value).select('svg').node();
    const point = d3.pointer(event, svgNode);
    const transform = currentTransform.value;
    d.startMousePos = [(point[0] - transform.x) / transform.k, (point[1] - transform.y) / transform.k];
};

const dragged = (event, d) => {
    if (!d.startPos || !d.startMousePos) return;

    // 获取当前鼠标位置
    const svgNode = d3.select(chartContainer.value).select('svg').node();
    const point = d3.pointer(event, svgNode);
    const transform = currentTransform.value;
    const currentMousePos = [(point[0] - transform.x) / transform.k, (point[1] - transform.y) / transform.k];

    // 计算偏移量
    const dx = currentMousePos[0] - d.startMousePos[0];
    const dy = currentMousePos[1] - d.startMousePos[1];

    // 更新点的位置
    d[0] = snapToGrid(d.startPos[0] + dx);
    d[1] = snapToGrid(d.startPos[1] + dy);

    drawChart();
};

const dragEnded = (event, d) => {
    d3.select(event.sourceEvent.target).classed('active', false);
    // 清理临时数据
    delete d.startPos;
    delete d.startMousePos;

    // 保存当前状态到撤销栈
    if (editingPolygon.value) {
        undoStack.value.push(JSON.parse(JSON.stringify(editingPolygon.value.points)));
    } else {
        undoStack.value.push([...points.value]);
    }
    redoStack.value = [];
};

// Function to calculate the center of the polygon
const calculatePolygonCenter = (points) => {
    const x = points.map(point => point[0]);
    const y = points.map(point => point[1]);
    const centerX = x.reduce((sum, val) => sum + val, 0) / points.length;
    const centerY = y.reduce((sum, val) => sum + val, 0) / points.length;
    return [centerX, centerY];
};

// Undo function
const undo = () => {
    if (undoStack.value.length > 0) {
        const lastAction = undoStack.value.pop();

        if (lastAction.type === 'clear') {
            // 如果是清空操作，保存当前状态到重做栈
            redoStack.value.push({
                type: 'clear',
                data: JSON.parse(JSON.stringify(savedPolygons.value))
            });
            // 恢复之前的状态
            savedPolygons.value = lastAction.data;
        } else {
            // 处理普通的点操作
            redoStack.value.push([...points.value]);
            points.value = lastAction;
        }

        drawChart();
    }
};

// Redo function
const redo = () => {
    if (redoStack.value.length > 0) {
        const nextAction = redoStack.value.pop();

        if (nextAction.type === 'clear') {
            // 如果是清空操作，保存当前状态到撤销栈
            undoStack.value.push({
                type: 'clear',
                data: JSON.parse(JSON.stringify(savedPolygons.value))
            });
            // 恢复清空后的状态
            savedPolygons.value = nextAction.data;
        } else {
            // 处理普通的点操作
            undoStack.value.push([...points.value]);
            points.value = nextAction;
        }

        drawChart();
    }
};

// Save shapes to local storage
const saveShapes = () => {
    if (!company.value) {
        message('请选择公司！');
        return;
    }

    if (!polygonName.value) {
        message('请输入多形名称！');
        return;
    }

    // 如果是编辑现有图形
    if (editingPolygon.value) {
        const { type, index } = editingPolygon.value;
        const polygonArray = type === 'area' ? savedPolygons.value.areas : savedPolygons.value.units;

        // 更新图形属性，保持 isCircle 标记
        polygonArray[index] = {
            ...polygonArray[index],
            name: polygonName.value,
            color: selectedColor.value,
            points: [...editingPolygon.value.points], // 创建点数组的副本
            isCircle: editingPolygon.value.points.isCircle || polygonArray[index].isCircle // 保持原有的圆形标记
        };

        editingPolygon.value = null;
    } else {
        // 保存新图形
        if (points.value.length < 3) {
            message('请至少绘制三个点！');
            return;
        }

        const shapeData = {
            id: Date.now(),
            company: company.value,
            points: [...points.value], // 创建点数组的副本
            name: polygonName.value,
            color: selectedColor.value,
            isCircle: points.value.isCircle // 保存圆形标记
        };

        if (drawingMode.value === 'area') {
            savedPolygons.value.areas.push(shapeData);
        } else {
            savedPolygons.value.units.push({
                ...shapeData,
                areaId: currentAreaId.value
            });
        }
    }

    localStorage.setItem('savedShapes', JSON.stringify(savedPolygons.value));

    // 重置状态
    points.value = [];
    polygonName.value = '';
    undoStack.value = [];
    redoStack.value = [];
    drawing = false;
    selectedPolygons.value.clear();

    drawChart();
    message('保存成功!');
};

// Clear all shapes and reset
const clearShapes = () => {
    // 保存当前状态用于撤销
    const previousState = JSON.parse(JSON.stringify(savedPolygons.value));
    undoStack.value.push({
        type: 'clear',
        data: previousState
    });
    redoStack.value = [];

    // 清空当前绘制状态
    points.value = [];
    polygonName.value = '';
    drawing = false;
    selectedPolygons.value.clear();

    if (drawingMode.value === 'area') {
        // 区域模式：清空当前公司的所有区域
        savedPolygons.value = {
            areas: savedPolygons.value.areas.filter(item => item.company !== company.value),
            units: savedPolygons.value.units.filter(item => item.company !== company.value)
        };
    } else {
        // 单元模式：清空当前区域下的单元
        savedPolygons.value = {
            areas: savedPolygons.value.areas, // 保持区域不变
            units: savedPolygons.value.units.filter(item =>
                item.areaId !== currentAreaId.value || item.company !== company.value
            )
        };
    }

    localStorage.setItem('savedShapes', JSON.stringify(savedPolygons.value));
    drawChart();
};

// Set shape type (for extensibility)
const setShape = (shape) => {
    if (shape === 'polygon') {
        clearShapes(); // Clear the current drawing and set up for a new polygon
    }
};

// Computed properties to check if undo/redo actions are possible
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

// 添加下载图形功能
const downloadImage = () => {
    // 获取SVG元素
    const svg = d3.select(chartContainer.value).select('svg').node();

    // 创建一个临时的Canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 设置Canvas尺寸与SVG相同
    canvas.width = svg.width.baseVal.value;
    canvas.height = svg.height.baseVal.value;

    // 将SVG转换为图片数据
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // 创建图片对象
    const img = new Image();
    img.onload = () => {
        // 在Canvas上绘制图片
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // 将Canvas转换为图片并下载
        const imgURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${polygonName.value || 'polygon'}.png`;
        link.href = imgURL;
        link.click();

        // 清理资源
        URL.revokeObjectURL(url);
    };
    img.src = url;
};

// 添加键盘事件处理函数
const handleKeyboard = (event) => {
    if (props.readonly) return; // 只读模式下不处键盘事件

    // 撤销：Ctrl+Z 或 Command+Z
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        undo();
    }
    // 重做：Ctrl+Shift+Z 或 Command+Shift+Z
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') {
        event.preventDefault();
        redo();
    }
    // 删除：Backspace 或 Delete
    else if ((event.key === 'Backspace' || event.key === 'Delete') && canDelete.value) {
        event.preventDefault();
        deleteSelected();
    }
};

// Lifecycle hook to initialize the drawing area
onMounted(() => {
    const savedData = localStorage.getItem('savedShapes');
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            // 处理旧数据格式到新格式的迁移
            if (Array.isArray(parsedData)) {
                // 如果是旧格式（数组），则全部作为区域数据
                savedPolygons.value = {
                    areas: parsedData,
                    units: []
                };
            } else {
                // 如果已经是新格式（包含 areas 和 units），直接使用
                savedPolygons.value = parsedData;
            }
        } catch (e) {
            console.error('Error parsing saved shapes:', e);
            savedPolygons.value = {
                areas: [],
                units: []
            };
        }
    } else {
        // 如果没有保存的数据，使用 MockShape
        try {
            const mockData = Array.isArray(MockShape) ? { areas: MockShape, units: [] } : MockShape;
            savedPolygons.value = mockData;
        } catch (e) {
            console.error('Error loading mock shapes:', e);
            savedPolygons.value = {
                areas: [],
                units: []
            };
        }
    }

    drawChart();

    // 添加键盘事件监听
    window.addEventListener('keydown', handleKeyboard);
});

// 添加 onUnmounted 清理事件监听
onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyboard);
});

// 修改拖动相关的函数
const dragPolygonStarted = (event, index, type) => {
    // 根据类型获取正确的数组
    const polygonArray = type === 'area' ? savedPolygons.value.areas : savedPolygons.value.units;
    const polygon = polygonArray[index];

    if (!polygon) return;

    polygon.startPoints = JSON.parse(JSON.stringify(polygon.points));
    // 获取相对于 SVG 元素的初始鼠标位置
    const svgNode = d3.select(chartContainer.value).select('svg').node();
    const point = d3.pointer(event, svgNode);
    const transform = currentTransform.value;
    polygon.startMousePos = [(point[0] - transform.x) / transform.k, (point[1] - transform.y) / transform.k];
};

const dragPolygon = (event, index, type) => {
    const polygonArray = type === 'area' ? savedPolygons.value.areas : savedPolygons.value.units;
    const polygon = polygonArray[index];

    if (!polygon || !polygon.startPoints || !polygon.startMousePos) return;

    // 获取当前鼠标位置并应用变换
    const svgNode = d3.select(chartContainer.value).select('svg').node();
    const point = d3.pointer(event, svgNode);
    const transform = currentTransform.value;
    const currentMousePos = [(point[0] - transform.x) / transform.k, (point[1] - transform.y) / transform.k];

    // 计算偏移量
    const dx = currentMousePos[0] - polygon.startMousePos[0];
    const dy = currentMousePos[1] - polygon.startMousePos[1];

    // 根据图形类型决定是否使用网格吸附
    if (polygon.isCircle) {
        // 圆形不使用网格吸附
        polygon.points = polygon.startPoints.map(point => [
            point[0] + dx,
            point[1] + dy
        ]);
    } else {
        // 非圆形使用网格吸附
        polygon.points = polygon.startPoints.map(point => [
            snapToGrid(point[0] + dx),
            snapToGrid(point[1] + dy)
        ]);
    }

    drawChart();
};

const dragPolygonEnded = (event, index, type) => {
    const polygonArray = type === 'area' ? savedPolygons.value.areas : savedPolygons.value.units;
    const polygon = polygonArray[index];

    if (!polygon) return;

    delete polygon.startPoints;
    delete polygon.startMousePos;
    localStorage.setItem('savedShapes', JSON.stringify(savedPolygons.value));
};

// 添加对齐功能
const alignShapes = (alignment) => {
    if (selectedPolygons.value.size < 2) return;

    const selectedShapes = Array.from(selectedPolygons.value).map(selectionId => {
        const [type, indexStr] = selectionId.split('-');
        const index = parseInt(indexStr);
        return type === 'area'
            ? savedPolygons.value.areas[index]
            : savedPolygons.value.units[index];
    }).filter(Boolean);

    // 计算界框
    const bounds = selectedShapes.map(polygon => {
        const xs = polygon.points.map(p => p[0]);
        const ys = polygon.points.map(p => p[1]);
        return {
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            centerX: (Math.max(...xs) + Math.min(...xs)) / 2,
            centerY: (Math.max(...ys) + Math.min(...ys)) / 2
        };
    });

    // 根据不同的齐方式计算偏移量
    selectedShapes.forEach((polygon, i) => {
        const currentBound = bounds[i];
        let dx = 0, dy = 0;

        switch (alignment) {
            case 'left':
                dx = Math.min(...bounds.map(b => b.left)) - currentBound.left;
                break;
            case 'center':
                const centerX = bounds.reduce((sum, b) => sum + b.centerX, 0) / bounds.length;
                dx = centerX - currentBound.centerX;
                break;
            case 'right':
                dx = Math.max(...bounds.map(b => b.right)) - currentBound.right;
                break;
            case 'top':
                dy = Math.min(...bounds.map(b => b.top)) - currentBound.top;
                break;
            case 'middle':
                const centerY = bounds.reduce((sum, b) => sum + b.centerY, 0) / bounds.length;
                dy = centerY - currentBound.centerY;
                break;
            case 'bottom':
                dy = Math.max(...bounds.map(b => b.bottom)) - currentBound.bottom;
                break;
        }

        // 应用偏移量
        polygon.points = polygon.points.map(point => [
            point[0] + dx,
            point[1] + dy
        ]);
    });

    // 保存更改并重绘
    localStorage.setItem('savedShapes', JSON.stringify(savedPolygons.value));
    drawChart();
};

// 添加是否可以删除的计算属性
const canDelete = computed(() => selectedPolygons.value.size > 0);

// 添加删除选中多边形的功能
const deleteSelected = () => {
    if (selectedPolygons.value.size === 0) return;

    const previousState = JSON.parse(JSON.stringify(savedPolygons.value));
    undoStack.value.push({
        type: 'clear',
        data: previousState
    });

    // 收集要删除的索引
    const toDeleteAreas = [];
    const toDeleteUnits = [];

    selectedPolygons.value.forEach(selectionId => {
        const [type, indexStr] = selectionId.split('-');
        const index = parseInt(indexStr);

        // 确保在正确的模式下删除正确类型的图形
        if (type === 'area' && drawingMode.value === 'area') {
            toDeleteAreas.push(index);
        } else if (type === 'unit' && drawingMode.value === 'unit') {
            toDeleteUnits.push(index);
        }
    });

    // 按索引从大到小排序,这样删除时不会影响其他元素的索引
    toDeleteAreas.sort((a, b) => b - a);
    toDeleteUnits.sort((a, b) => b - a);

    // 删除区域
    toDeleteAreas.forEach(index => {
        savedPolygons.value.areas.splice(index, 1);
    });

    // 删除单元
    toDeleteUnits.forEach(index => {
        savedPolygons.value.units.splice(index, 1);
    });

    // 清空选择状态
    selectedPolygons.value.clear();

    // 保存更改到localStorage
    localStorage.setItem('savedShapes', JSON.stringify(savedPolygons.value));

    // 重新绘制
    drawChart();
};

const exportData = () => {
    console.log(savedPolygons.value);
    const parsedData = savedPolygons.value; // 解析 JSON 数据
    const blob = new Blob([JSON.stringify(parsedData, null, 2)], { type: 'application/json' }); // 创建 Blob 对象
    const url = URL.createObjectURL(blob); // 创建下载链接

    const a = document.createElement('a'); // 创建一个链接元素
    a.href = url;
    a.download = 'data.json'; // 设置下载文件名
    document.body.appendChild(a); // 将链接添加到文档
    a.click(); // 模拟点击下载
    document.body.removeChild(a); // 下载后移除链接
    URL.revokeObjectURL(url); // 释放 URL 对象
}

// 修改 handleContextMenu 函数
const handleContextMenu = (event, polygon) => {
    event.preventDefault();

    if (polygon.type === 'area') {
        // 切换到单元绘制模式，移除只读模式判断
        drawingMode.value = 'unit';
        currentAreaId.value = polygon.id;
        // 清空当前绘制的点
        points.value = [];
        // 清空选择状态
        selectedPolygons.value.clear();
        // 重新绘制
        drawChart();
        message('已进入单元模式');
    }
};

// 添加返回区域绘制模式的功能
const backToAreaMode = () => {
    drawingMode.value = 'area';
    currentAreaId.value = null;
    points.value = [];
    selectedPolygons.value.clear();
    drawChart();
};

// 添加绘制多边形的辅助函数
const drawPolygon = (g, polygon, index, type, isBackground = false) => {
    const legendItem = legendStatus.value.find(item => item.value === polygon.color);
    if (!legendItem?.visible) return;

    if (isBackground) {
        // 创建一个剪切路径
        const clipId = `clip-${polygon.id}`;
        g.append('defs')
            .append('clipPath')
            .attr('id', clipId)
            .append('polygon')
            .attr('points', polygon.points.map(d => d.join(',')).join(' '));

        // 创建一个覆盖整个视图的矩形作为背景
        const svgNode = d3.select(chartContainer.value).select('svg').node();
        const width = svgNode.getBoundingClientRect().width;
        const height = svgNode.getBoundingClientRect().height;

        // 添加背景矩形
        g.append('rect')
            .attr('x', -width)
            .attr('y', -height)
            .attr('width', width * 3) // 确保覆盖整个可视区域
            .attr('height', height * 3)
            .style('fill', polygon.color)
            .style('opacity', 0.15)
            .attr('clip-path', `url(#${clipId})`);

        // 添加边界轮廓
        g.append('polygon')
            .attr('points', polygon.points.map(d => d.join(',')).join(' '))
            .style('fill', 'none')
            .attr('stroke', polygon.color)
            .attr('stroke-width', 2)
            .style('opacity', 0.3)
            .style('pointer-events', 'none');

        // 添加区域名称
        if (polygon.name) {
            const center = calculatePolygonCenter(polygon.points);
            g.append('text')
                .attr('x', center[0])
                .attr('y', center[1])
                .attr('text-anchor', 'middle')
                .attr('fill', '#666')
                .attr('font-size', '14px')
                .style('opacity', 0.3)
                .style('pointer-events', 'none')
                .text(polygon.name);
        }

        return; // 提前返回，不执行后续的交互代码
    }

    const selectionId = `${type}-${index}`;
    const isSelected = selectedPolygons.value.has(selectionId);
    const isEditing = editingPolygon.value?.selectionId === selectionId;
    const isCircle = polygon.isCircle; // 新增：判断是否为圆形

    // 创建多边形元素
    const polygonElement = g.append('polygon')
        .attr('points', polygon.points.map(d => d.join(',')).join(' '))
        .style('fill', polygon.color)
        .style('opacity', isBackground ? 0.3 : 1)
        .attr('stroke', isSelected ? '#000' : 'black')
        .attr('stroke-width', isSelected ? 3 : 2)
        .style('cursor', 'move')
        .style('stroke-dasharray', isSelected ? '5,5' : 'none')
        .attr('data-index', index)
        .attr('data-type', type);

    if (!isBackground && !props.readonly) {
        const shouldAddEvents = (drawingMode.value === 'area' && type === 'area') ||
            (drawingMode.value === 'unit' && type === 'unit');

        if (shouldAddEvents) {
            polygonElement
                .on('click', (event) => togglePolygonSelection(index, event, type))
                .call(
                    d3.drag()
                        .on('start', function (event) {
                            dragPolygonStarted(event, index, type);
                        })
                        .on('drag', function (event) {
                            dragPolygon(event, index, type);
                        })
                        .on('end', function (event) {
                            dragPolygonEnded(event, index, type);
                        })
                );
        }

        // 如果正在编辑且不是圆形，显示顶点
        if (isEditing && !isCircle) {
            g.selectAll('circle.vertex')
                .data(polygon.points)
                .enter()
                .append('circle')
                .attr('class', 'vertex')
                .attr('cx', d => d[0])
                .attr('cy', d => d[1])
                .attr('r', 6)
                .attr('fill', 'yellow')
                .attr('stroke', 'black')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .call(
                    d3.drag()
                        .on('start', function (event, d) {
                            d3.select(this).raise().classed('active', true);
                        })
                        .on('drag', function (event, d) {
                            const transform = currentTransform.value;
                            const svgNode = d3.select(chartContainer.value).select('svg').node();
                            const point = d3.pointer(event, svgNode);
                            const x = (point[0] - transform.x) / transform.k;
                            const y = (point[1] - transform.y) / transform.k;
                            d[0] = snapToGrid(x);
                            d[1] = snapToGrid(y);
                            editingPolygon.value.points = polygon.points;
                            drawChart();
                        })
                        .on('end', function (event, d) {
                            d3.select(this).classed('active', false);
                        })
                );
        }

        // 如果是圆形且正在编辑，添加缩放控制点
        if (isEditing && isCircle) {
            const center = calculatePolygonCenter(polygon.points);
            const radius = Math.sqrt(
                Math.pow(polygon.points[0][0] - center[0], 2) +
                Math.pow(polygon.points[0][1] - center[1], 2)
            );

            // 添加四个缩放控制点（上下左右）
            const controlPoints = [
                [center[0], center[1] - radius], // 上
                [center[0] + radius, center[1]], // 右
                [center[0], center[1] + radius], // 下
                [center[0] - radius, center[1]]  // 左
            ];

            g.selectAll('circle.resize-handle')
                .data(controlPoints)
                .enter()
                .append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', d => d[0])
                .attr('cy', d => d[1])
                .attr('r', 6)
                .attr('fill', 'yellow')
                .attr('stroke', 'black')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .call(
                    d3.drag()
                        .on('start', function (event, d) {
                            d3.select(this).raise().classed('active', true);
                        })
                        .on('drag', function (event, d) {
                            const transform = currentTransform.value;
                            const svgNode = d3.select(chartContainer.value).select('svg').node();
                            const point = d3.pointer(event, svgNode);
                            const x = (point[0] - transform.x) / transform.k;
                            const y = (point[1] - transform.y) / transform.k;

                            // 计算新半径（使用网格吸附）
                            const newRadius = Math.sqrt(
                                Math.pow(x - center[0], 2) +
                                Math.pow(y - center[1], 2)
                            );

                            // 更新所有点以保持圆形（不使用网格吸附）
                            polygon.points = Array.from({ length: 100 }, (_, i) => {
                                const angle = (i / 100) * Math.PI * 2;
                                return [
                                    center[0] + newRadius * Math.cos(angle),
                                    center[1] + newRadius * Math.sin(angle)
                                ];
                            });

                            editingPolygon.value.points = polygon.points;
                            drawChart();
                        })
                        .on('end', function (event, d) {
                            d3.select(this).classed('active', false);
                        })
                );
        }
    }

    if (type === 'area') {
        polygonElement.on('contextmenu', (event) => {
            handleContextMenu(event, { type, id: polygon.id });
        });
    }

    // 添加多边形名称
    if (polygon.name) {
        const center = calculatePolygonCenter(polygon.points);
        g.append('text')
            .attr('x', center[0])
            .attr('y', center[1])
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .attr('font-size', '14px')
            .style('opacity', isBackground ? 0.3 : 1) // 背景文字也使用0.3的透明度
            .text(polygon.name);
    }
};

// 添加计算属性获取当前区域名称
const currentAreaName = computed(() => {
    if (drawingMode.value === 'unit' && currentAreaId.value) {
        const currentArea = savedPolygons.value.areas.find(area => area.id === currentAreaId.value);
        return currentArea?.name || '';
    }
    return '';
});

// 添加取消编辑的功能
const cancelEdit = () => {
    editingPolygon.value = null;
    selectedPolygons.value.clear();
    polygonName.value = '';
    drawChart();
};

// 添加模板图形的函数
const addTemplate = (shape) => {
    // 获取当前视角的中心点
    const svg = d3.select(chartContainer.value).select('svg');
    const width = svg.node().getBoundingClientRect().width;
    const height = svg.node().getBoundingClientRect().height;
    const transform = currentTransform.value;

    // 计算当前视角中心在实际坐标系中的位置
    const viewCenterX = (width / 2 - transform.x) / transform.k;
    const viewCenterY = (height / 2 - transform.y) / transform.k;

    // 将中心点对齐到最近的网格
    const centerX = snapToGrid(viewCenterX);
    const centerY = snapToGrid(viewCenterY);

    // 清空当前点
    points.value = [];

    // 根据选择的模板生成对应的点
    switch (shape) {
        case 'rectangle': {
            // 确保矩形边长是网格间距的整数倍
            const size = Math.floor(100 / gridSpacing) * gridSpacing;
            const x1 = snapToGrid(centerX - size / 2);
            const y1 = snapToGrid(centerY - size / 2);
            const x2 = snapToGrid(centerX + size / 2);
            const y2 = snapToGrid(centerY + size / 2);
            points.value = [
                [x1, y1],
                [x2, y1],
                [x2, y2],
                [x1, y2]
            ];
            break;
        }
        case 'triangle': {
            // 确保三角形的边长是网格间距的整数倍
            const size = Math.floor(120 / gridSpacing) * gridSpacing;
            //const x1 = snapToGrid(centerX - size/2);
            const x1 = centerX;
            const y1 = snapToGrid(centerY - size / 2);
            const x2 = snapToGrid(centerX + size / 2);
            const y2 = snapToGrid(centerY + size / 2);
            const x3 = snapToGrid(centerX - size / 2);
            const y3 = snapToGrid(centerY + size / 2);
            points.value = [
                [x1, y1],
                [x2, y2],
                [x3, y3]
            ];
            break;
        }
        case 'circle': {
            // 圆形不需要对齐网格
            const radius = 50;
            const segments = 100;
            points.value = Array.from({ length: segments }, (_, i) => {
                const angle = (i / segments) * Math.PI * 2;
                return [
                    centerX + radius * Math.cos(angle),
                    centerY + radius * Math.sin(angle)
                ];
            });
            points.value.isCircle = true;
            break;
        }
        case 'polygon':
            points.value = [];
            break;
    }

    if (points.value.length > 0) {
        undoStack.value.push([]);
        redoStack.value = [];
    }

    drawChart();
};

</script>
