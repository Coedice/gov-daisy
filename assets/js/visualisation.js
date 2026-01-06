// Arc Appearance Constants
const ARC_PAD_ANGLE_MAX = 0.005;
const ARC_PAD_RADIUS_RATIO = 0.5;

// Geometry Constants
const HOLE_RADIUS_RATIO = 0.15;  // Size of donut hole (15% of total radius)
const SEGMENT_THICKNESS = 60;    // Fixed thickness for each segment in pixels
const CENTRE_CIRCLE_COLOR = "transparent";  // Original center circle color

// Text Position Constants
const CENTRE_VALUE_Y = 0;
const CENTRE_SUBTITLE_Y = 32;
const CENTRE_NAME_Y = 52;

// Animation Constants
const TRANSITION_DURATION = 750;  // Duration for segment transitions in ms

// Filtering Constants
const ZERO_ANGLE_THRESHOLD = 0;  // Minimum angle for segments to be visible
if (!window.squishedDepths) window.squishedDepths = new Set();

let currentData = null;
let currentYear = null;
let viewMode = "budget";
let svg, g, radius, arc, root, safeArc;
let currentFocus = null;

document.addEventListener("DOMContentLoaded", function() {
    if (window.expenditureData && window.yearSliderYears) {
        const yearSlider = document.getElementById("year-slider");
        const years = window.yearSliderYears;
        // Set up slider min, max, and value
        if (yearSlider) {
            yearSlider.min = 0;
            yearSlider.max = years.length - 1;
            // Try to set default to current fiscal year if present
            let fyIdx = -1;
            for (let i = 0; i < years.length; i++) {
                // Fiscal year string is like '2023-24', so parse the end year
                const fy = years[i].replace("_", "-");
                const parts = fy.split("-");
                if (parts.length === 2) {
                    let startYear = parseInt(parts[0], 10);
                    let endYearShort = parseInt(parts[1], 10);
                    if (!isNaN(startYear) && !isNaN(endYearShort)) {
                        // Fiscal year ends in June, so if now is before July, use previous FY
                        let fyStart = startYear;
                        let fiscalYearForNow = (new Date()).getMonth() < 6 ? (new Date()).getFullYear() - 1 : (new Date()).getFullYear();
                        if (fyStart === fiscalYearForNow) {
                            fyIdx = i;
                            break;
                        }
                    }
                }
            }
            let idx = fyIdx !== -1 ? fyIdx : years.length - 1;
            yearSlider.value = idx;
            currentYear = years[idx] || years[years.length - 1];
            // Set the label
            const yearSliderValue = document.getElementById("year-slider-value");
            if (yearSliderValue) {
                let displayYear = currentYear.replace("_","-");
                yearSliderValue.textContent = displayYear;
            }
        }
    }
    initialiseVisualisation();
    setupEventListeners();
    setupDataTypeSwitch();
});
function setupDataTypeSwitch() {
    const dataTypeSwitch = document.getElementById("data-type-switch");
    if (!dataTypeSwitch) return;
    dataTypeSwitch.addEventListener("change", function(e) {
        if (e.target.value === "budget") {
            window.expenditureData = window.budgetData;
            viewMode = "budget";
        } else if (e.target.value === "revenue") {
            window.expenditureData = window.revenueData;
            viewMode = "revenue";
        }
        // Update year slider and reload data
        const years = Object.keys(window.expenditureData).sort();
        window.yearSliderYears = years;
        const yearSlider = document.getElementById("year-slider");
        if (yearSlider) {
            yearSlider.min = 0;
            yearSlider.max = years.length - 1;
            let idx = years.indexOf(currentYear);
            if (idx === -1) idx = years.length - 1;
            yearSlider.value = idx;
            currentYear = years[idx];
        }
        currentFocus = null;
        initialiseVisualisation();
    });
}

function setupEventListeners() { 
    const yearSlider = document.getElementById("year-slider");
    const yearSliderValue = document.getElementById("year-slider-value");
    if (yearSlider && yearSliderValue && window.yearSliderYears) {
        yearSlider.addEventListener("input", function(event) {
            const idx = parseInt(event.target.value, 10);
            const years = window.yearSliderYears;
            if (years && years[idx]) {
                let displayYear = years[idx].replace("_","-");
                yearSliderValue.textContent = displayYear;
                handleYearChange({ target: { value: years[idx] } });
                if (typeof root !== "undefined") {
                    updateCentreInfo(root);
                }
            }
        });
    }
}

async function initialiseVisualisation() {
    await loadData(currentYear);
    createSunburst();
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
    const container = document.getElementById("visualisation-container");
    const width = Math.max(container.clientWidth - 40, 600);
    const height = 800;
    radius = Math.min(width, height) / 2;
    d3.select("#sunburst").selectAll("*").remove();
    svg = d3.select("#sunburst")
        .attr("width", width)
        .attr("height", height);
    g = svg.append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);
    const partition = d3.partition()
        .size([2 * Math.PI, radius]);
    root = d3.hierarchy(currentData)
        .sum(d => d.budget || d.totalBudget || 0)
        .sort((a, b) => b.value - a.value);
    partition(root);
    root.each(d => {
        d.current = {
            x0: d.x0, 
            x1: d.x1, 
            depth: d.depth,
            opacity: 1
        };
        d.originalX0 = d.x0;
        d.originalX1 = d.x1;
        d.originalDepth = d.depth;
    });
    arc = d3.arc()
        .startAngle(d => Math.max(0, d.x0))
        .endAngle(d => Math.min(2 * Math.PI, Math.max(d.x0, d.x1)))
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, ARC_PAD_ANGLE_MAX))
        .padRadius(radius * ARC_PAD_RADIUS_RATIO)
        .innerRadius(d => radius * HOLE_RADIUS_RATIO + d.depth * SEGMENT_THICKNESS)
        .outerRadius(d => radius * HOLE_RADIUS_RATIO + (d.depth + 1) * SEGMENT_THICKNESS);
    
    // Create a wrapper arc function that returns empty for zero-angle segments
    safeArc = (d) => (d.x1 - d.x0) > ZERO_ANGLE_THRESHOLD ? arc(d) : "";
    g.selectAll(".centre-circle").remove();
    g.append("circle")
        .attr("class", "centre-circle")
        .attr("r", radius * HOLE_RADIUS_RATIO * 2)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .style("pointer-events", "all")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        });
    const colour = d3.scaleOrdinal()
        .domain(root.children.map(d => d.data.name))
        .range(d3.schemeSet3);
    g.selectAll("path")
        .data(root.descendants().filter(d => d.depth > 0 && !window.squishedDepths.has(d.depth) && (d.x1 - d.x0) > ZERO_ANGLE_THRESHOLD))
        .join("path")
        .attr("fill", d => {
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
        .attr("d", safeArc)
        .style("pointer-events", d => (d.x1 - d.x0) > ZERO_ANGLE_THRESHOLD ? "auto" : "none")
        .on("click", clicked)
        .on("mouseover", handleMouseOver)
        .on("mouseout", handleMouseOut);
    g.selectAll(".centre-value-svg").remove();
    g.selectAll(".centre-subtitle-svg").remove();
    g.selectAll(".centre-name-svg").remove();
    g.append("text")
        .attr("class", "centre-value-svg")
        .attr("y", CENTRE_VALUE_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-subtitle-svg")
        .attr("y", CENTRE_SUBTITLE_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-name-svg")
        .attr("y", CENTRE_NAME_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-subtitle-svg")
        .attr("y", CENTRE_SUBTITLE_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-name-svg")
        .attr("y", CENTRE_NAME_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-subtitle-svg")
        .attr("y", CENTRE_SUBTITLE_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    g.append("text")
        .attr("class", "centre-name-svg")
        .attr("y", CENTRE_NAME_Y)
        .style("cursor", currentFocus !== root ? "pointer" : "default")
        .on("click", function() {
            if (currentFocus !== root) {
                resetZoom();
            }
        })
        .text("");
    if (!currentFocus) {
        currentFocus = root;
        updateCentreInfo(root);
    } else {
        updateCentreInfo(currentFocus);
    }
}


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

function clicked(event, p) {
    event.stopPropagation();
    
    // Ignore clicks on zero-angle segments
    if ((p.x1 - p.x0) <= 0.001) {
        return;
    }
    
    const tapped = p;
    const ringDepth = tapped.depth;
    window.squishedDepths = new Set(
        Array.from(window.squishedDepths).filter(depth => depth < ringDepth)
    );
    root.each(d => {
        const isClickedSegment = d === p;
        const isAncestorOfClicked = !isClickedSegment && p !== root && p.ancestors().includes(d);
        const newDepth = Math.max(0, d.originalDepth - p.originalDepth);
        d.target = {
            x0: Math.max(0, Math.min(1, (d.originalX0 - p.originalX0) / (p.originalX1 - p.originalX0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.originalX1 - p.originalX0) / (p.originalX1 - p.originalX0))) * 2 * Math.PI,
            depth: newDepth,
            opacity: (isClickedSegment || isAncestorOfClicked) ? 0 : 1  // Fade clicked segment and its ancestors
        };
    });
    const squishedRingCount = root.descendants().filter(d => d.depth === ringDepth).length;
    const arcs = g.selectAll("path")
        .data(root.descendants().filter(d => d.depth > 0 && !window.squishedDepths.has(d.depth) && (d.x1 - d.x0) > ZERO_ANGLE_THRESHOLD), d => d.ancestors().map(n => n.data.name).join("/"));
    
    // Change center circle color for leaf segments at start of transition
    if (!p.children || p.children.length === 0) {
        const clickedSegment = arcs.filter(d => d === p);
        const segmentColor = clickedSegment.style("fill");
        // Use a transition to animate the color change
        g.select(".centre-circle")
            .transition()
            .duration(TRANSITION_DURATION) // Same duration as segment transition
            .style("fill", segmentColor);
    }
    
    arcs.transition()
        .duration(TRANSITION_DURATION)
        .tween("data", d => {
            const i = d3.interpolate(d.current, d.target);
            return t => d.current = i(t);
        })
        .attrTween("d", d => () => safeArc(d.current))
        .styleTween("opacity", d => () => d.current.opacity || 1)
        .on("end", function() {
            // Hide the clicked segment and its ancestors after fade out
            const datum = d3.select(this).datum();
            if (datum === p || (p !== root && p.ancestors().includes(datum))) {
                d3.select(this).style("display", "none");
            }
            window.squishedDepths.add(ringDepth);
            currentFocus = p;
            updateCentreInfo(currentFocus);
        });
    if (squishedRingCount === 0) {
        const ancestryPath = getAncestryPath(p);
        const newFocus = findNodeByPath(root, ancestryPath);
        currentFocus = newFocus || root;
        createSunburst();
        updateCentreInfo(currentFocus);
    }
}

function handleMouseOver(event, d) {
    const tooltip = document.getElementById("tooltip");
    const value = d.value;
    const percentage = formatNumber((value / root.value) * 100, 2);
    
    // Show parent name if this node is $m
    let label = d.data.name === "$m" && d.parent ? d.parent.data.name : d.data.name;
    let tooltipHTML = `
        <strong>${label}</strong><br>
        ${formatCurrency(value)}<br>
        <span class="percentage">${percentage}% of total</span>
    `;
    
    if (viewMode === "comparison" && d.data.budget && d.data.actual) {
        const variance = d.data.actual - d.data.budget;
        const variancePercent = formatNumber((variance / d.data.budget) * 100, 2);
        tooltipHTML += `<br><br>
            <strong>Budget:</strong> ${formatCurrency(d.data.budget)}<br>
            <strong>Actual:</strong> ${formatCurrency(d.data.actual)}<br>
            <strong>Variance:</strong> <span class="${variance > 0 ? "over-budget" : "under-budget"}">
                ${variance > 0 ? "+" : ""}${formatCurrency(variance)} (${variancePercent}%)
            </span>
        `;
    }
    
    tooltip.innerHTML = tooltipHTML;
    tooltip.style.display = "block";
    tooltip.style.left = (event.clientX + 15) + "px";
    tooltip.style.top = (event.clientY + 15) + "px";
    
    // Highlight the segment
    d3.select(event.currentTarget)
        .classed("hovered", true);
    
    
}

function handleMouseOut(event) {
    document.getElementById("tooltip").style.display = "none";
    d3.select(event.currentTarget)
        .classed("hovered", false);
    
    // Reset center circle color
    g.select(".centre-circle")
        .style("fill", CENTRE_CIRCLE_COLOR);
}

function updateCentreInfo(node) {
    const value = node.value;
    const percentage = formatNumber((value / root.value) * 100, 2);
    const subtitle = node.depth === 0 ? `100% of ${viewMode === "revenue" ? "revenue" : "budget"}` : `${percentage}% of ${viewMode === "revenue" ? "revenue" : "budget"}`;
    const segmentName = node.depth === 0 ? "" : (node.data.name === "$m" && node.parent ? node.parent.data.name : node.data.name);
    // Update SVG text elements
    g.select(".centre-value-svg").text(formatCurrency(value));
    g.select(".centre-subtitle-svg").text(subtitle);
    g.select(".centre-name-svg").text(segmentName);
}

function resetZoom() {
    if (window.squishedDepths) window.squishedDepths.clear();
    // Reset center circle color
    g.select(".centre-circle")
        .style("fill", CENTRE_CIRCLE_COLOR);
    // Make all segments visible again
    g.selectAll("path")
        .style("display", null)
        .each(d => {
            if (d.current && d.current.opacity === 0) {
                d.current.opacity = 0; // Keep current opacity at 0 so it animates up
            }
        });
    clicked({ stopPropagation: () => {} }, root);
}

async function handleYearChange(event) {
    currentYear = event.target.value;
    await loadData(currentYear);
    // Reset zoom/focus to root and clear squishedDepths so all rings are visible
    if (window.squishedDepths) window.squishedDepths.clear();
    currentFocus = null;
    createSunburst();
    // Update slider position if changed programmatically
    const yearSlider = document.getElementById("year-slider");
    const years = window.yearSliderYears;
    if (yearSlider && years) {
        const idx = years.indexOf(currentYear);
        if (idx !== -1) yearSlider.value = idx;
        const yearSliderValue = document.getElementById("year-slider-value");
        if (yearSliderValue) {
            let displayYear = currentYear.replace("_","-");
            const now = new Date();
            const fyParts = displayYear.split("-");
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
                displayYear += " (estimate)";
            }
            yearSliderValue.textContent = displayYear;
        }
    }
    // Ensure centre-value updates to the new root for the selected year
    if (typeof root !== "undefined") {
        currentFocus = root;
        updateCentreInfo(root);
    }
}

function formatNumber(num, maxDecimals = 2) {
    const s = Number(num).toFixed(maxDecimals);
    return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatCurrency(value) {
    const sign = value < 0 ? "-" : "";
    const suffixes = ["", "K", "M", "B", "T"];
    let abs = Math.abs(value);
    let i = 0;
    while (abs >= 1e3 && i < suffixes.length - 1) {
        abs /= 1e3;
        i++;
    }
    return sign + "$" + formatNumber(abs, 2) + suffixes[i];
}

// Handle window resize
let resizeTimer;
window.addEventListener("resize", function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        if (currentData) {
            createSunburst();
        }
    }, 250);
});
