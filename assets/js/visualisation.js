
if (!window.squishedDepths) window.squishedDepths = new Set();

let currentData = null;
let currentYear = null;
let viewMode = 'budget';
let svg, g, radius, arc, root;
let searchResults = [];
let currentFocus = null;

document.addEventListener('DOMContentLoaded', function() {
    if (window.expenditureData && window.yearSliderYears) {
        const yearSlider = document.getElementById('year-slider');
        const years = window.yearSliderYears;
        let idx = yearSlider ? parseInt(yearSlider.value, 10) : years.length - 1;
        if (isNaN(idx) || idx < 0 || idx >= years.length) idx = years.length - 1;
        currentYear = years[idx] || years[years.length - 1];
    }
    initialiseVisualisation();
    setupEventListeners();
});

function setupEventListeners() { 
    const yearSlider = document.getElementById('year-slider');
    const yearSliderValue = document.getElementById('year-slider-value');
    if (yearSlider && yearSliderValue && window.yearSliderYears) {
        yearSlider.addEventListener('input', function(event) {
            const idx = parseInt(event.target.value, 10);
            const years = window.yearSliderYears;
            if (years && years[idx]) {
                let displayYear = years[idx].replace('_','-');
                const now = new Date();
                const fyParts = displayYear.split('-');
                let fyEnd = null;
                if (fyParts.length === 2) {
                    let startYear = parseInt(fyParts[0], 10);
                    let endYearShort = parseInt(fyParts[1], 10);
                    if (!isNaN(startYear) && !isNaN(endYearShort)) {
                        let century = Math.floor(startYear / 100) * 100;
                        let endYear = century + endYearShort;
                        if (endYearShort < (startYear % 100)) endYear += 100;
                        fyEnd = endYear;
                    }
                }
                if (fyEnd !== null && fyEnd > now.getFullYear()) {
                    displayYear += ' (estimate)';
                }
                yearSliderValue.textContent = displayYear;
                handleYearChange({ target: { value: years[idx] } });
                if (typeof root !== 'undefined') {
                    updateCentreInfo(root);
                }
            }
        });
    }
}

async function initialiseVisualisation() {
    await loadData(currentYear);
    createSunburst();
    createLegend();
}

async function loadData(year) {
    try {
        if (window.expenditureData && window.expenditureData[year]) {
            currentData = window.expenditureData[year];
            return currentData;
        }
        return null;
    } catch (error) {
        return null;
    }
}

function createSunburst() {
    const container = document.getElementById('visualisation-container');
    const width = Math.max(container.clientWidth - 40, 600);
    const height = 800;
    radius = Math.min(width, height) / 2 - 20;
    d3.select('#sunburst').selectAll('*').remove();
    svg = d3.select('#sunburst')
        .attr('width', width)
        .attr('height', height);
    g = svg.append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);
    const partition = d3.partition()
        .size([2 * Math.PI, radius]);
    function filterDollarM(node) {
        if (node.name === '$m' && (!node.children || node.children.length === 0)) {
            return null;
        }
        if (node.children) {
            node.children = node.children
                .map(filterDollarM)
                .filter(child => child !== null);
        }
        return node;
    }
    const filteredData = filterDollarM(JSON.parse(JSON.stringify(currentData)));
    root = d3.hierarchy(filteredData)
        .sum(d => getValueForMode(d))
        .sort((a, b) => b.value - a.value);
    partition(root);
    root.each(d => {
        d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };
    });
    arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius / 2)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1 - 1);
    const colour = d3.scaleOrdinal()
        .domain(root.children.map(d => d.data.name))
        .range(d3.schemeSet3);
    const path = g.selectAll('path')
        .data(root.descendants().filter(d => d.depth > 0 && !window.squishedDepths.has(d.depth)))
        .join('path')
        .attr('fill', d => {
            if (viewMode === 'comparison' && d.data.budget && d.data.actual) {
                const variance = ((d.data.actual - d.data.budget) / d.data.budget) * 100;
                return getVarianceColour(variance);
            }
            let topLevel = d;
            while (topLevel.depth > 1) topLevel = topLevel.parent;
            const parentColour = colour(topLevel.data.name);
            if (d.depth === 1) {
                return parentColour;
            }
            let secondLevelAncestor = d;
            while (secondLevelAncestor.depth > 2) secondLevelAncestor = secondLevelAncestor.parent;
            const siblings = secondLevelAncestor.parent && secondLevelAncestor.parent.children ? secondLevelAncestor.parent.children : [];
            const idx = Math.max(0, siblings.indexOf(secondLevelAncestor));
            const count = Math.max(1, siblings.length);
            const baseHSL = d3.hsl(parentColour);
            const hueSpan = 60;
            const frac = count > 1 ? idx / (count - 1) : 0.5;
            const hueOffset = (frac - 0.5) * hueSpan;
            const childHue = (baseHSL.h + hueOffset + 360) % 360;
            const satSpan = 0.2;
            const childSat = Math.max(0, Math.min(1, baseHSL.s + (frac - 0.5) * satSpan));
            if (d.depth === 2) {
                return d3.hsl(childHue, childSat, baseHSL.l).toString();
            }
            const deeperLightness = Math.max(0, Math.min(1, baseHSL.l - 0.12 - (d.depth - 2) * 0.07));
            return d3.hsl(childHue, childSat, deeperLightness).toString();
        })
        .attr('d', arc)
        .style('cursor', 'pointer')
        .style('stroke', '#fff')
        .style('stroke-width', '2px')
        .on('click', clicked)
        .on('mouseover', handleMouseOver)
        .on('mouseout', handleMouseOut);
    g.selectAll('.centre-circle').remove();
    g.append('circle')
        .attr('class', 'centre-circle')
        .attr('r', radius * 0.25)
        .style('fill', 'transparent')
        .style('cursor', currentFocus !== root ? 'pointer' : 'default')
        .style('pointer-events', 'all')
        .on('click', function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        });
    if (!currentFocus) {
        currentFocus = root;
        updateCentreInfo(root);
    } else {
        updateCentreInfo(currentFocus);
    }
}

function getValueForMode(d) {
    // Handle both raw data objects and node data
    const data = d.data || d;
    
    // Only count leaf nodes - if this has children, let D3 sum them instead
    if (data.children && data.children.length > 0) {
        return 0;
    }
    return data.budget || data.totalBudget || 0;
}

function getVarianceColour(variance) {
    if (variance < -5) return '#27ae60'; // Dark green - significantly under budget
    if (variance < 0) return '#2ecc71'; // Green - under budget
    if (variance < 5) return '#f39c12'; // Orange - slightly over budget
    if (variance < 10) return '#e67e22'; // Dark orange - over budget
    return '#e74c3c'; // Red - significantly over budget
}

function clicked(event, p) {
    event.stopPropagation();
    const tapped = p;
    const ringDepth = tapped.depth;
    window.squishedDepths = new Set(
        Array.from(window.squishedDepths).filter(depth => depth < ringDepth)
    );
    root.each(d => d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
    });
    const squishedRingCount = root.descendants().filter(d => d.depth === ringDepth).length;
    root.each(d => d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
    });
    const arcs = g.selectAll('path')
        .data(root.descendants().filter(d => d.depth > 0 && !window.squishedDepths.has(d.depth)), d => d.ancestors().map(n => n.data.name).join('/'));
    arcs.transition()
        .duration(750)
        .tween('data', d => {
            const i = d3.interpolate(d.current, d.target);
            return t => d.current = i(t);
        })
        .attrTween('d', d => () => arc(d.current))
        .on('end', function(_, d) {
            window.squishedDepths.add(ringDepth);
            currentFocus = p;
            updateCentreInfo(currentFocus);
        });
    if (squishedRingCount === 0) {
        function getAncestryPath(node) {
            const path = [];
            let n = node;
            while (n) {
                path.unshift(n.data && n.data.name);
                n = n.parent;
            }
            return path;
        }
        function findNodeByPath(node, pathArr, depth = 0) {
            if (!node || !pathArr || node.data.name !== pathArr[depth]) return null;
            if (depth === pathArr.length - 1) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNodeByPath(child, pathArr, depth + 1);
                    if (found) return found;
                }
            }
            return null;
        }
        const ancestryPath = getAncestryPath(p);
        const newFocus = findNodeByPath(root, ancestryPath);
        currentFocus = newFocus || root;
        createSunburst();
        updateCentreInfo(currentFocus);
    }
}

function handleMouseOver(event, d) {
    const tooltip = document.getElementById('tooltip');
    const value = d.value;
    const percentage = formatNumber((value / root.value) * 100, 2);
    
    // Show parent name if this node is $m
    let label = d.data.name === '$m' && d.parent ? d.parent.data.name : d.data.name;
    let tooltipHTML = `
        <strong>${label}</strong><br>
        ${formatCurrency(value)}<br>
        <span class="percentage">${percentage}% of total</span>
    `;
    
    if (viewMode === 'comparison' && d.data.budget && d.data.actual) {
        const variance = d.data.actual - d.data.budget;
        const variancePercent = formatNumber((variance / d.data.budget) * 100, 2);
        tooltipHTML += `<br><br>
            <strong>Budget:</strong> ${formatCurrency(d.data.budget)}<br>
            <strong>Actual:</strong> ${formatCurrency(d.data.actual)}<br>
            <strong>Variance:</strong> <span class="${variance > 0 ? 'over-budget' : 'under-budget'}">
                ${variance > 0 ? '+' : ''}${formatCurrency(variance)} (${variancePercent}%)
            </span>
        `;
    }
    
    tooltip.innerHTML = tooltipHTML;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY + 15) + 'px';
    
    // Highlight the segment
    d3.select(event.currentTarget)
        .style('opacity', 0.8)
        .style('stroke-width', '3px');
}

function handleMouseOut(event) {
    document.getElementById('tooltip').style.display = 'none';
    d3.select(event.currentTarget)
        .style('opacity', 1)
        .style('stroke-width', '2px');
}

function updateCentreInfo(node) {
    const value = node.value;
    document.getElementById('centre-value').textContent = formatCurrency(value);
    
    if (node.depth === 0) {
        document.getElementById('centre-subtitle').textContent = '';
        document.getElementById('centre-info').style.cursor = 'default';
    } else {
        const percentage = formatNumber((value / root.value) * 100, 2);
        document.getElementById('centre-subtitle').textContent = `${percentage}% of budget`;
        document.getElementById('centre-info').style.cursor = 'pointer';
    }
}


function zoomOut() {
    if (currentFocus && currentFocus.parent) {
        // Remove squished state for the new focus ring (parent's depth)
        const newDepth = currentFocus.parent.depth + 1;
        window.squishedDepths.delete(newDepth);
        clicked({ stopPropagation: () => {} }, currentFocus.parent);
    } else {
    }
}

function resetZoom() {
    if (window.squishedDepths) window.squishedDepths.clear();
    clicked({ stopPropagation: () => {} }, root);
    document.getElementById('breadcrumb').innerHTML = '';
}

function updateStats() {
    // Stats display removed as per user request
    return;
}

function createLegend() {
    if (!root || !root.children) return;
    const legendItems = document.getElementById('legend-items');
    if (!legendItems) return;
    legendItems.innerHTML = '';
    const colour = d3.scaleOrdinal()
        .domain(root.children.map(d => d.data.name))
        .range(d3.schemeSet3);
    root.children.forEach(child => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const colourBox = document.createElement('span');
        colourBox.className = 'legend-colour';
        colourBox.style.backgroundColor = colour(child.data.name);
        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = child.data.name;
        item.appendChild(colourBox);
        item.appendChild(label);
        legendItems.appendChild(item);
    });
}

async function handleYearChange(event) {
    currentYear = event.target.value;
    await loadData(currentYear);
    // Reset zoom/focus to root and clear squishedDepths so all rings are visible
    if (window.squishedDepths) window.squishedDepths.clear();
    currentFocus = null;
    createSunburst();
    // Update slider position if changed programmatically
    const yearSlider = document.getElementById('year-slider');
    const years = window.yearSliderYears;
    if (yearSlider && years) {
        const idx = years.indexOf(currentYear);
        if (idx !== -1) yearSlider.value = idx;
        const yearSliderValue = document.getElementById('year-slider-value');
        if (yearSliderValue) {
            let displayYear = currentYear.replace('_','-');
            const now = new Date();
            const fyParts = displayYear.split('-');
            let fyEnd = null;
            if (fyParts.length === 2) {
                let startYear = parseInt(fyParts[0], 10);
                let endYearShort = parseInt(fyParts[1], 10);
                if (!isNaN(startYear) && !isNaN(endYearShort)) {
                    let century = Math.floor(startYear / 100) * 100;
                    let endYear = century + endYearShort;
                    if (endYearShort < (startYear % 100)) endYear += 100;
                    fyEnd = endYear;
                }
            }
            if (fyEnd !== null && fyEnd > now.getFullYear()) {
                displayYear += ' (estimate)';
            }
            yearSliderValue.textContent = displayYear;
        }
    }
    // Ensure centre-value updates to the new root for the selected year
    if (typeof root !== 'undefined') {
        currentFocus = root;
        updateCentreInfo(root);
    }
}

// handleViewModeChange removed (no longer needed)
function exportData() {
    const dataStr = JSON.stringify(currentData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `government-expenditure-${currentYear}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function formatNumber(num, maxDecimals = 2) {
    const s = Number(num).toFixed(maxDecimals);
    return s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatCurrency(value) {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1e12) {
        return sign + '$' + formatNumber(abs / 1e12, 2) + 'T';
    } else if (abs >= 1e9) {
        return sign + '$' + formatNumber(abs / 1e9, 2) + 'B';
    } else if (abs >= 1e6) {
        return sign + '$' + formatNumber(abs / 1e6, 2) + 'M';
    } else if (abs >= 1e3) {
        return sign + '$' + formatNumber(abs / 1e3, 2) + 'K';
    }
    return sign + '$' + formatNumber(abs, 2);
}

// Handle window resize
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        if (currentData) {
            createSunburst();
        }
    }, 250);
});
