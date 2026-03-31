const form = document.getElementById("designerForm");
const metricGrid = document.getElementById("metricGrid");
const railGrid = document.getElementById("railGrid");
const assumptions = document.getElementById("assumptions");
const metricCardTemplate = document.getElementById("metricCardTemplate");
const railCardTemplate = document.getElementById("railCardTemplate");
const architectureDesignInput = document.getElementById("architectureDesign");
const gpusPerNodeInput = document.getElementById("gpusPerNode");
const scaleUnitsInput = document.getElementById("scaleUnits");
const nodesPerScaleUnitInput = document.getElementById("nodesPerScaleUnit");
const totalGpusInput = document.getElementById("totalGpus");
const railsPerLeafInput = document.getElementById("railsPerLeaf");
const topologyModal = document.getElementById("topologyModal");
const topologyModalBody = document.getElementById("topologyModalBody");
const closeTopologyModalButton = document.getElementById("closeTopologyModal");

const MAX_TOTAL_GPUS = 2048;
const numberFormatter = new Intl.NumberFormat("en-US");

function clampPositiveInteger(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function formatCount(value) {
  return numberFormatter.format(Math.round(value));
}

function formatSpeed(value) {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} Tbps`;
  }

  return `${numberFormatter.format(value)} Gbps`;
}

function formatTbps(valueInGbps) {
  const tbps = valueInGbps / 1000;
  return `${tbps.toLocaleString("en-US", {
    minimumFractionDigits: tbps < 10 ? 2 : 1,
    maximumFractionDigits: tbps < 10 ? 2 : 1,
  })} Tbps`;
}

function buildMetricCard({ label, value, note }) {
  const fragment = metricCardTemplate.content.cloneNode(true);
  fragment.querySelector(".metric-label").textContent = label;
  fragment.querySelector(".metric-value").textContent = value;
  fragment.querySelector(".metric-note").textContent = note;
  return fragment;
}

function buildBoxRow(count, label, tone) {
  const visibleCount = Math.min(count, 6);
  const boxes = [];

  for (let index = 0; index < visibleCount; index += 1) {
    boxes.push(`<div class="diagram-box ${tone}">${label} ${index + 1}</div>`);
  }

  if (count > visibleCount) {
    boxes.push(`<div class="diagram-box ${tone}">+${count - visibleCount} more</div>`);
  }

  return `<div class="diagram-layer">${boxes.join("")}</div>`;
}

function largestPowerOfTwoAtMost(value) {
  let power = 1;

  while (power * 2 <= value) {
    power *= 2;
  }

  return power;
}

function nextPowerOfTwoAtLeast(value) {
  let power = 1;

  while (power < value) {
    power *= 2;
  }

  return power;
}

function buildGpuGroupPalette(groupCount) {
  const strongPalette = [
    { color: "#d62828", softColor: "#fde7e7" },
    { color: "#1d4ed8", softColor: "#e6eefc" },
    { color: "#15803d", softColor: "#e7f6eb" },
    { color: "#a21caf", softColor: "#f7e8fb" },
    { color: "#ea580c", softColor: "#feeee5" },
    { color: "#0f766e", softColor: "#e3f6f3" },
    { color: "#ca8a04", softColor: "#fff6d9" },
    { color: "#111827", softColor: "#e8eaf0" },
  ];

  return Array.from({ length: groupCount }, (_, index) => ({
    index,
    label: `Rail ${index + 1}`,
    color: strongPalette[index].color,
    softColor: strongPalette[index].softColor,
  }));
}

function finalizeLeaf(leafs, leaf, capacity) {
  if (leaf.segments.length === 0) {
    return;
  }

  if (leaf.usedDownlinks < capacity) {
    leaf.segments.push({
      label: "Unused",
      railIndex: null,
      fraction: (capacity - leaf.usedDownlinks) / capacity,
      downlinks: capacity - leaf.usedDownlinks,
      color: "rgba(87, 68, 48, 0.08)",
      softColor: "rgba(255, 255, 255, 0.92)",
      isUnused: true,
    });
  }

  leafs.push(leaf);
}

function createLeafSwitchPlan(design) {
  const totalRails = design.inputs.gpusPerNode;
  const railSize = design.totalNodes;
  const capacity = design.totalAvailableDownlinks;
  const palette = buildGpuGroupPalette(totalRails);
  const leafs = [];

  if (railSize <= capacity) {
    const rawRailsPerLeaf = Math.max(1, Math.floor(capacity / railSize));
    let railIndex = 0;

    for (let leafIndex = 0; leafIndex < design.totalLeaf && railIndex < totalRails; leafIndex += 1) {
      const remainingRails = totalRails - railIndex;
      const remainingLeafs = design.totalLeaf - leafIndex;
      const minRailsPerLeaf = Math.max(1, Math.ceil(remainingRails / remainingLeafs));
      const railsPerLeaf = Math.min(
        totalRails,
        8,
        largestPowerOfTwoAtMost(rawRailsPerLeaf),
        largestPowerOfTwoAtMost(minRailsPerLeaf),
      );

      const leaf = {
        usedDownlinks: 0,
        attachedRails: [],
        segments: [],
      };

      for (
        let offset = 0;
        offset < railsPerLeaf && railIndex + offset < totalRails;
        offset += 1
      ) {
        const paletteEntry = palette[railIndex + offset];
        leaf.attachedRails.push(paletteEntry.label);
        leaf.usedDownlinks += railSize;
        leaf.segments.push({
          label: paletteEntry.label,
          railIndex: railIndex + offset,
          fraction: railSize / capacity,
          downlinks: railSize,
          color: paletteEntry.color,
          softColor: paletteEntry.softColor,
          isUnused: false,
        });
      }

      finalizeLeaf(leafs, leaf, capacity);
      railIndex += railsPerLeaf;
    }
  } else {
    let currentLeaf = {
      usedDownlinks: 0,
      attachedRails: [],
      segments: [],
    };

    for (let railIndex = 0; railIndex < totalRails; railIndex += 1) {
      let remainingRail = railSize;
      const paletteEntry = palette[railIndex];

      while (remainingRail > 0) {
        const remainingCapacity = capacity - currentLeaf.usedDownlinks;
        if (remainingCapacity === 0) {
          finalizeLeaf(leafs, currentLeaf, capacity);
          currentLeaf = {
            usedDownlinks: 0,
            attachedRails: [],
            segments: [],
          };
        }

        const usableCapacity = capacity - currentLeaf.usedDownlinks;
        const assignedDownlinks = Math.min(remainingRail, usableCapacity);

        if (!currentLeaf.attachedRails.includes(paletteEntry.label)) {
          currentLeaf.attachedRails.push(paletteEntry.label);
        }

        currentLeaf.usedDownlinks += assignedDownlinks;
        currentLeaf.segments.push({
          label: paletteEntry.label,
          railIndex,
          fraction: assignedDownlinks / capacity,
          downlinks: assignedDownlinks,
          color: paletteEntry.color,
          softColor: paletteEntry.softColor,
          isUnused: false,
        });
        remainingRail -= assignedDownlinks;

        if (currentLeaf.usedDownlinks === capacity) {
          finalizeLeaf(leafs, currentLeaf, capacity);
          currentLeaf = {
            usedDownlinks: 0,
            attachedRails: [],
            segments: [],
          };
        }
      }
    }

    finalizeLeaf(leafs, currentLeaf, capacity);
  }

  while (leafs.length < design.totalLeaf) {
    leafs.push({
      usedDownlinks: 0,
      attachedRails: ["Standby"],
      segments: [
        {
          label: "Unused",
          railIndex: null,
          fraction: 1,
          downlinks: capacity,
          color: "rgba(87, 68, 48, 0.08)",
          softColor: "rgba(255, 255, 255, 0.92)",
          isUnused: true,
        },
      ],
    });
  }

  return {
    palette,
    leafs,
    railSize,
  };
}

function buildLeafSwitchTiles(design) {
  const plan = createLeafSwitchPlan(design);
  const visibleLeafCount = Math.min(plan.leafs.length, 12);
  const leafTiles = [];

  for (let index = 0; index < visibleLeafCount; index += 1) {
    const leaf = plan.leafs[index];

    leafTiles.push(`
      <article class="leaf-switch-tile">
        <header class="leaf-switch-heading">
          <span>Leaf ${index + 1}</span>
          <strong>${formatCount(leaf.attachedRails.filter((label) => label !== "Standby").length || 0)} rail${leaf.attachedRails.filter((label) => label !== "Standby").length === 1 ? "" : "s"}</strong>
        </header>
        <div class="leaf-switch-body">
          <div class="leaf-switch-zone uplink-zone">
            ${
              design.totalLeaf > 1
                ? leaf.segments
                    .map((segment) => {
                      if (segment.isUnused) {
                        return `
                          <div
                            class="uplink-rail-group uplink-rail-group-unused"
                            style="flex: ${segment.fraction} 0 0;"
                          >
                            <strong>(${formatCount(segment.downlinks)})</strong>
                          </div>
                        `;
                      }

                      const spineBoxes =
                        design.totalSpine > 0
                          ? Array.from({ length: design.totalSpine }, (_, spineIndex) => {
                              const basePorts = Math.floor(segment.downlinks / design.totalSpine);
                              const remainder = segment.downlinks % design.totalSpine;
                              const spinePorts = basePorts + (spineIndex < remainder ? 1 : 0);

                              return `
                                <div class="uplink-spine-slice">
                                  <strong>${formatCount(spinePorts)}</strong>
                                </div>
                              `;
                            }).join("")
                          : "";

                      return `
                        <div
                          class="uplink-rail-group ${design.totalSpine > 0 ? "uplink-rail-group-split" : "uplink-rail-group-direct"}"
                          style="--uplink-color: ${segment.color}; --uplink-soft-color: ${segment.softColor}; flex: ${segment.fraction} 0 0;"
                        >
                          ${
                            design.totalSpine > 0
                              ? `<div class="uplink-spine-slices">${spineBoxes}</div>`
                              : `<strong>${formatCount(segment.downlinks)}</strong>`
                          }
                        </div>
                      `;
                    })
                    .join("")
                : `
                  <div class="uplink-rail-group uplink-rail-group-single">
                    <span>Uplink</span>
                    <strong>${formatCount(design.maxClients)}</strong>
                  </div>
                `
            }
          </div>
          <div class="leaf-switch-zone downlink-zone">
            ${leaf.segments
              .map(
                (segment) => {
                  return `
                  <div
                    class="gpu-group-segment ${segment.isUnused ? "gpu-group-segment-unused" : ""}"
                    style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${segment.fraction} 0 0;"
                  >
                    <strong>${segment.isUnused ? `(${formatCount(segment.downlinks)})` : formatCount(segment.downlinks)}</strong>
                  </div>
                `;
                },
              )
              .join("")}
          </div>
        </div>
      </article>
    `);
  }

  const overflowNote =
    plan.leafs.length > visibleLeafCount
      ? `<p class="leaf-switch-overflow">Showing ${formatCount(visibleLeafCount)} of ${formatCount(plan.leafs.length)} leaf switches.</p>`
      : "";

  const legend = `
    <div class="gpu-group-legend">
      ${plan.palette
        .map(
          (group) => `
            <div class="gpu-group-chip">
              <span class="gpu-group-swatch" style="background: ${group.color};"></span>
              <span>${group.label}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;

  return `
    <div class="leaf-switch-layout">
      <p class="leaf-switch-copy">
        Each rail is a GPU index group of size ${formatCount(plan.railSize)}. Rails are packed from Leaf 1 onward, using powers of two when a rail fits inside a single leaf and fractional spillover when a rail is larger than one leaf.
      </p>
      ${legend}
      <div class="leaf-switch-grid">
        ${leafTiles.join("")}
      </div>
      ${overflowNote}
    </div>
  `;
}

function projectLeafToRail(leaf, targetRailIndex, capacity) {
  const matchingSegments = leaf.segments.filter(
    (segment) => !segment.isUnused && segment.railIndex === targetRailIndex,
  );
  if (matchingSegments.length === 0) {
    return null;
  }

  const usedByTargetRail = matchingSegments.reduce((sum, segment) => sum + segment.downlinks, 0);
  const unusedDownlinks = Math.max(0, capacity - usedByTargetRail);

  return {
    ...leaf,
    segments: [
      ...matchingSegments,
      ...(unusedDownlinks > 0
        ? [
            {
              label: "Unused",
              railIndex: null,
              fraction: unusedDownlinks / capacity,
              downlinks: unusedDownlinks,
              color: "rgba(87, 68, 48, 0.08)",
              softColor: "rgba(255, 255, 255, 0.92)",
              isUnused: true,
            },
          ]
        : []),
    ],
  };
}

function buildSharedFabricChart(leafs, design, chartId) {
  if (leafs.length === 0) {
    return "";
  }

  if (design.totalSpine === 0) {
    const pairedLeafs = leafs.slice(0, 2);
    const showDirectConnectHeader = chartId.startsWith("modal");
    const directLeafUplinkPorts = pairedLeafs[0]
      ? pairedLeafs[0].segments
          .filter((segment) => !segment.isUnused)
          .reduce((sum, segment) => sum + segment.downlinks, 0)
      : 0;
    const directLeafBandwidthGbps = directLeafUplinkPorts * design.inputs.nicSpeed;

    return `
      <div class="shared-fabric-chart" data-spine-chart="true" data-chart-id="${chartId}">
        <svg class="spine-topology-overlay" aria-hidden="true"></svg>
        ${
          showDirectConnectHeader
            ? `
              <div class="shared-direct-row">
                <div class="shared-direct-label" data-link-target="${chartId}-direct-target">
                  Leafs Uplinks are directly connected
                </div>
                <div class="shared-direct-info">
                  Leaf Uplinks are connected directly with ${formatSpeed(directLeafBandwidthGbps)} bandwidth capacity
                </div>
              </div>
            `
            : ""
        }
        <div class="shared-leaf-grid">
          ${pairedLeafs
            .map(
              (leaf, leafIndex) => `
                <div class="spine-diagram-leaf">
                  <div class="spine-diagram-leaf-label">Leaf ${leafIndex + 1}</div>
                  <div class="spine-diagram-leaf-box">
                    <div class="spine-diagram-leaf-uplinks">
                      ${leaf.segments
                        .map((segment, segmentIndex) => {
                          const pairKey =
                            !segment.isUnused && pairedLeafs.length === 2
                              ? `${chartId}-direct-target`
                              : "";

                          return `
                            <div
                              class="spine-leaf-uplink-segment ${segment.isUnused ? "spine-leaf-uplink-segment-unused" : "spine-leaf-uplink-segment-direct"}"
                              style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${segment.downlinks} 0 0;"
                              ${
                                pairKey
                                  ? `data-link-source="${pairKey}" data-link-color="${segment.color}" data-link-direct="true" data-rail-index="${segment.railIndex}"`
                                  : ""
                              }
                            >
                              <strong>${segment.isUnused ? `(${formatCount(segment.downlinks)})` : formatCount(segment.downlinks)}</strong>
                            </div>
                          `;
                        })
                        .join("")}
                    </div>
                    <div class="spine-diagram-leaf-downlinks">
                      ${leaf.segments
                        .map(
                          (segment) => `
                            <div
                              class="spine-leaf-downlink-segment ${segment.isUnused ? "spine-leaf-downlink-segment-unused" : ""}"
                              style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${segment.downlinks} 0 0;"
                            >
                              <strong>${segment.isUnused ? `(${formatCount(segment.downlinks)})` : formatCount(segment.downlinks)}</strong>
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  const spineBoxes = Array.from({ length: design.totalSpine }, (_, spineIndex) => {
    const segments = leafs
      .flatMap((leaf, leafIndex) =>
        leaf.segments
          .filter((segment) => !segment.isUnused)
          .map((segment) => {
            const basePorts = Math.floor(segment.downlinks / design.totalSpine);
            const remainder = segment.downlinks % design.totalSpine;
            const spinePorts = basePorts + (spineIndex < remainder ? 1 : 0);

            return {
              key: `${chartId}-${leafIndex}-${segment.railIndex}-${spineIndex}`,
              color: segment.color,
              softColor: segment.softColor,
              ports: spinePorts,
            };
          }),
      )
      .filter((segment) => segment.ports > 0);

    const usedPorts = segments.reduce((sum, segment) => sum + segment.ports, 0);
    const unusedPorts = Math.max(0, design.totalAvailableDownlinks - usedPorts);

    return `
      <div class="shared-spine-box-card">
        <div class="spine-box-title">Spine ${spineIndex + 1}</div>
        <div class="spine-box-bar">
          ${segments
            .map(
              (segment) => `
                <div
                  class="spine-box-segment"
                  style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${segment.ports} 0 0;"
                  data-link-target="${segment.key}"
                >
                  <strong>${formatCount(segment.ports)}</strong>
                </div>
              `,
            )
            .join("")}
          ${
            unusedPorts > 0
              ? `
                <div class="spine-box-segment spine-box-segment-unused" style="flex: ${unusedPorts} 0 0;">
                  <strong>(${formatCount(unusedPorts)})</strong>
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="shared-fabric-chart" data-spine-chart="true" data-chart-id="${chartId}">
      <svg class="spine-topology-overlay" aria-hidden="true"></svg>
      <div class="shared-spine-row">
        ${spineBoxes}
      </div>
      <div class="shared-leaf-grid">
        ${leafs
          .map((leaf, leafIndex) => {
            const leafUplinkSegments = leaf.segments
              .map((segment) => {
                if (segment.isUnused) {
                  return `
                    <div class="spine-leaf-uplink-segment spine-leaf-uplink-segment-unused" style="flex: ${segment.downlinks} 0 0;">
                      <strong>(${formatCount(segment.downlinks)})</strong>
                    </div>
                  `;
                }

                const perSpineSlices = Array.from({ length: design.totalSpine }, (_, spineIndex) => {
                  const basePorts = Math.floor(segment.downlinks / design.totalSpine);
                  const remainder = segment.downlinks % design.totalSpine;
                  const spinePorts = basePorts + (spineIndex < remainder ? 1 : 0);

                  return `
                    <div
                      class="spine-leaf-uplink-slice"
                      style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${spinePorts} 0 0;"
                      data-link-source="${chartId}-${leafIndex}-${segment.railIndex}-${spineIndex}"
                      data-link-color="${segment.color}"
                      data-rail-index="${segment.railIndex}"
                    >
                      <strong>${formatCount(spinePorts)}</strong>
                    </div>
                  `;
                }).join("");

                return `
                  <div class="spine-leaf-uplink-segment" style="flex: ${segment.downlinks} 0 0;">
                    ${perSpineSlices}
                  </div>
                `;
              })
              .join("");

            const leafDownlinkSegments = leaf.segments
              .map(
                (segment) => `
                  <div
                    class="spine-leaf-downlink-segment ${segment.isUnused ? "spine-leaf-downlink-segment-unused" : ""}"
                    style="--segment-color: ${segment.color}; --segment-soft-color: ${segment.softColor}; flex: ${segment.downlinks} 0 0;"
                  >
                    <strong>${segment.isUnused ? `(${formatCount(segment.downlinks)})` : formatCount(segment.downlinks)}</strong>
                  </div>
                `,
              )
              .join("");

            return `
              <div class="spine-diagram-leaf">
                <div class="spine-diagram-leaf-label">Leaf ${leafIndex + 1}</div>
                <div class="spine-diagram-leaf-box">
                  <div class="spine-diagram-leaf-uplinks">
                    ${leafUplinkSegments}
                  </div>
                  <div class="spine-diagram-leaf-downlinks">
                    ${leafDownlinkSegments}
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function buildFabricTopology(design) {
  const plan = createLeafSwitchPlan(design);
  const visibleLeafCount = Math.min(plan.leafs.length, 4);
  const visibleLeafs = plan.leafs.slice(0, visibleLeafCount);
  const summaryLeafs = visibleLeafs
    .map((leaf) => projectLeafToRail(leaf, 0, design.totalAvailableDownlinks))
    .filter(Boolean);

  return `
    <div class="spine-topology">
      <p class="leaf-switch-copy">
        Summary view shows one rail by default. Open the popup to inspect the full topology with all computed spines and leafs.
      </p>
      <div class="fabric-summary">
        ${buildSharedFabricChart(summaryLeafs, design, "summary")}
      </div>
      <button type="button" class="topology-open-button" data-open-topology="true">
        Open Full Topology
      </button>
    </div>
  `;
}

function buildFullFabricTopology(design) {
  const plan = createLeafSwitchPlan(design);
  const railLegend = buildGpuGroupPalette(design.inputs.gpusPerNode)
    .map(
      (group) => `
        <button
          type="button"
          class="topology-rail-chip"
          data-hover-rail="${group.index}"
          style="--chip-color: ${group.color}; --chip-soft-color: ${group.softColor};"
        >
          <span class="topology-rail-chip-swatch"></span>
          <span>${group.label}</span>
        </button>
      `,
    )
    .join("");

  return `
    <div class="spine-topology">
      <p class="leaf-switch-copy">
        Full topology popup showing all computed leafs with the shared spine row above them.
      </p>
      <div class="topology-rail-legend">
        ${railLegend}
      </div>
      <div class="fabric-details-body">
        ${buildSharedFabricChart(plan.leafs, design, "modal-full")}
      </div>
    </div>
  `;
}

function openTopologyModal() {
  topologyModal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(drawSpineTopologyLinks);
}

function closeTopologyModal() {
  topologyModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function calculateEraDesign(inputs) {
  const gpusPerNode = clampPositiveInteger(inputs.gpusPerNode, 8);
  const scaleUnits = clampPositiveInteger(inputs.scaleUnits, 4);
  const nodesPerScaleUnit = clampPositiveInteger(inputs.nodesPerScaleUnit, 4);
  const totalGpus = clampPositiveInteger(inputs.totalGpus, 512);
  const railsPerLeaf = clampPositiveInteger(inputs.railsPerLeaf, 1);
  const nicSpeed = clampPositiveInteger(inputs.nicSpeed, 400);
  const switchPortSpeed = clampPositiveInteger(inputs.switchPortSpeed, 800);
  const portsPerSwitch = clampPositiveInteger(inputs.portsPerSwitch, 64);

  if (totalGpus > MAX_TOTAL_GPUS) {
    return {
      error: `Total GPUs cannot exceed ${formatCount(MAX_TOTAL_GPUS)}.`,
    };
  }

  if (totalGpus % gpusPerNode !== 0) {
    return {
      error: "Total GPUs must be divisible by GPUs per node.",
    };
  }

  const nicToSwitchRatio = switchPortSpeed / nicSpeed;
  if (![1, 2, 4, 8].includes(nicToSwitchRatio)) {
    return {
      error:
        "ERA currently requires Switch port speed / NIC speed to be one of 1, 2, 4, or 8 for a clean non-blocking mapping.",
    };
  }

  const totalNodes = totalGpus / gpusPerNode;
  const gpusPerScaleUnit = nodesPerScaleUnit * gpusPerNode;
  const maxClients = Math.floor(portsPerSwitch / 2);
  const totalAvailableDownlinks = maxClients * nicToSwitchRatio;
  const railSize = totalNodes;
  const railOnLeaf = railSize / totalAvailableDownlinks;
  const totalLeaf = Math.max(2, Math.ceil(totalGpus / totalAvailableDownlinks));
  const leafPerGpuIndex = Math.ceil(totalNodes / totalAvailableDownlinks);
  const totalUsedDownlinks = totalGpus;
  const rawSpineCount =
    totalLeaf <= 2
      ? 0
      : Math.ceil((totalAvailableDownlinks * totalLeaf) / (totalAvailableDownlinks * 2));
  const totalSpine =
    rawSpineCount >= 2 ? nextPowerOfTwoAtLeast(rawSpineCount) : rawSpineCount;
  const portsPerSpine = totalSpine === 0 ? 0 : Math.ceil(totalUsedDownlinks / totalSpine);
  const aggregateBandwidthGbps = totalGpus * nicSpeed;

  return {
    architecture: "ERA",
    inputs: {
      gpusPerNode,
      scaleUnits,
      nodesPerScaleUnit,
      totalGpus,
      railsPerLeaf,
      nicSpeed,
      switchPortSpeed,
      portsPerSwitch,
    },
    totalNodes,
    gpusPerScaleUnit,
    maxClients,
    nicToSwitchRatio,
    totalAvailableDownlinks,
    railSize,
    railOnLeaf,
    totalLeaf,
    leafPerGpuIndex,
    totalSpine,
    totalSuperspine: 0,
    totalUsedDownlinks,
    portsPerSpine,
    aggregateBandwidthGbps,
  };
}

function calculateDesign(inputs) {
  if (inputs.architectureDesign === "ERA") {
    return calculateEraDesign(inputs);
  }

  return {
    error: "Unsupported architecture selection.",
  };
}

function buildTierCard({ kicker, title, capacity, facts, diagram }) {
  const fragment = railCardTemplate.content.cloneNode(true);
  fragment.querySelector(".rail-kicker").textContent = kicker;
  fragment.querySelector(".rail-title").textContent = title;
  fragment.querySelector(".rail-capacity").textContent = capacity;
  fragment.querySelector(".rail-facts").innerHTML = facts
    .map(([label, value]) => `<p>${label}<strong>${value}</strong></p>`)
    .join("");
  fragment.querySelector(".rail-diagram").innerHTML = diagram;
  return fragment;
}

function renderAssumptions(design) {
  const items = [
    "ERA assumes 1 NIC per GPU and ignores rails-per-leaf in the current computation.",
    `Non-blocking leaves reserve half of the switch ports for downlinks and half for uplinks, so MaxClients is ${formatCount(design.maxClients)} physical ports on each side.`,
    `NICtoSwitchRatio is Switch port speed / NIC speed = ${design.nicToSwitchRatio}, giving ${formatCount(design.totalAvailableDownlinks)} total client-side GPU downlinks per leaf.`,
    `Each rail is one GPU index across all nodes, so RailSize = ${formatCount(design.railSize)} downlinks.`,
    `RAILonleaf = RailSize / TotalAvailableDownlinks = ${design.railOnLeaf.toFixed(2)}.`,
    `Leaf count is calculated as max(2, ceil(Total GPUs / TotalAvailableDownlinks)) = ${formatCount(design.totalLeaf)} to preserve leaf-level redundancy.`,
    `Leafs per GPU index is calculated as ceil(Total nodes / TotalAvailableDownlinks) = ${formatCount(design.leafPerGpuIndex)}.`,
    `For the leaf visualization, each GPU index is shown as a rail with its own color, and rails are packed into leafs using powers of two.`,
    design.totalSpine > 0
      ? `Spine count is calculated from the non-blocking formula, then rounded up to the next power of two, giving ${formatCount(design.totalSpine)} spines.`
      : "No spine layer is needed when the design uses only 1 or 2 leafs because uplinks can connect directly.",
  ];

  assumptions.innerHTML = `
    <p class="eyebrow">ERA assumptions</p>
    <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
  `;
}

function render(design) {
  if (design.error) {
    metricGrid.innerHTML = buildMetricCard({
      label: "Configuration issue",
      value: "Cannot size topology",
      note: design.error,
    }).firstElementChild.outerHTML;
    railGrid.innerHTML = "";
    assumptions.innerHTML = `
      <p class="eyebrow">ERA assumptions</p>
      <ul><li>${design.error}</li></ul>
    `;
    return;
  }

  renderAssumptions(design);

  const metrics = [
    {
      label: "Total nodes",
      value: formatCount(design.totalNodes),
      note: `${formatCount(design.inputs.totalGpus)} GPUs at ${formatCount(design.inputs.gpusPerNode)} GPUs per node`,
    },
    {
      label: "Scale Units",
      value: (design.totalNodes / 4).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
      note: "1 scale unit = 4 nodes",
    },
    {
      label: "GPU per Scale Unit",
      value: formatCount(design.gpusPerScaleUnit),
      note: `${formatCount(design.inputs.nodesPerScaleUnit)} nodes per scale unit × ${formatCount(design.inputs.gpusPerNode)} GPUs per node`,
    },
    {
      label: "Switch to NIC Breakout",
      value: `${design.nicToSwitchRatio}:1`,
      note: `${formatSpeed(design.inputs.switchPortSpeed)} / ${formatSpeed(design.inputs.nicSpeed)}`,
    },
    {
      label: "Rail size",
      value: formatCount(design.railSize),
      note: "One GPU index group across all nodes",
    },
    {
      label: "Total spine switches",
      value: formatCount(design.totalSpine),
      note: "Rounded to the next power of two when needed",
    },
    {
      label: "Total leaf switches",
      value: formatCount(design.totalLeaf),
      note: "Rounded up from capacity, with a minimum of 2 leafs for redundancy",
    },
    {
      label: "Superspine switches",
      value: formatCount(design.totalSuperspine),
      note: "Not yet modeled in ERA",
    },
  ];

  metricGrid.innerHTML = "";
  metrics.forEach((metric) => {
    metricGrid.appendChild(buildMetricCard(metric));
  });

  railGrid.innerHTML = "";
  railGrid.appendChild(
    buildTierCard({
      kicker: "Fabric breakdown",
      title: "Rail 1 Cabling",
      capacity: "",
      facts: [],
      diagram: buildFabricTopology(design),
    }),
  );

  topologyModalBody.innerHTML = buildFullFabricTopology(design);

  requestAnimationFrame(drawSpineTopologyLinks);
}

function getInputs() {
  const formData = new FormData(form);

  return {
    architectureDesign: String(formData.get("architectureDesign")),
    gpusPerNode: Number(formData.get("gpusPerNode")),
    scaleUnits: Number(formData.get("scaleUnits")),
    nodesPerScaleUnit: Number(formData.get("nodesPerScaleUnit")),
    totalGpus: Number(formData.get("totalGpus")),
    railsPerLeaf: Number(formData.get("railsPerLeaf")),
    nicSpeed: Number(formData.get("nicSpeed")),
    switchPortSpeed: Number(formData.get("switchPortSpeed")),
    portsPerSwitch: Number(formData.get("portsPerSwitch")),
  };
}

function syncEraDerivedInputs() {
  const isEra = architectureDesignInput.value === "ERA";
  const gpusPerNode = Number(gpusPerNodeInput.value) || 8;
  let scaleUnits = clampPositiveInteger(Number(scaleUnitsInput.value), 4);
  let nodesPerScaleUnit = clampPositiveInteger(Number(nodesPerScaleUnitInput.value), 4);

  let totalGpus = scaleUnits * nodesPerScaleUnit * gpusPerNode;

  if (totalGpus > MAX_TOTAL_GPUS) {
    const maxNodesPerScaleUnit = Math.max(1, Math.floor(MAX_TOTAL_GPUS / (scaleUnits * gpusPerNode)));

    if (maxNodesPerScaleUnit >= 1) {
      nodesPerScaleUnit = maxNodesPerScaleUnit;
      nodesPerScaleUnitInput.value = String(nodesPerScaleUnit);
    } else {
      scaleUnits = Math.max(1, Math.floor(MAX_TOTAL_GPUS / (gpusPerNode * nodesPerScaleUnit)));
      scaleUnitsInput.value = String(scaleUnits);
    }

    totalGpus = scaleUnits * nodesPerScaleUnit * gpusPerNode;
  }

  totalGpusInput.min = String(gpusPerNode);
  totalGpusInput.max = String(MAX_TOTAL_GPUS);
  totalGpusInput.step = String(gpusPerNode);
  totalGpusInput.value = String(totalGpus);
  totalGpusInput.readOnly = isEra;
  railsPerLeafInput.disabled = isEra;
}

form.addEventListener("input", (event) => {
  if (
    event.target === architectureDesignInput ||
    event.target === gpusPerNodeInput ||
    event.target === scaleUnitsInput ||
    event.target === nodesPerScaleUnitInput
  ) {
    syncEraDerivedInputs();
  }

  render(calculateDesign(getInputs()));
});

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.closest("[data-open-topology='true']")) {
    openTopologyModal();
    return;
  }

  if (target.closest("[data-close-topology='true']")) {
    closeTopologyModal();
  }
});

closeTopologyModalButton.addEventListener("click", closeTopologyModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !topologyModal.hidden) {
    closeTopologyModal();
  }
});

function setActiveRailLinks(activeRailIndex) {
  const paths = topologyModalBody.querySelectorAll(".fabric-link-path");
  paths.forEach((path) => {
    const matches = path.getAttribute("data-rail-index") === String(activeRailIndex);
    path.setAttribute("stroke-opacity", matches ? "0.42" : "0");
  });
}

topologyModalBody.addEventListener("mouseover", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const chip = target.closest("[data-hover-rail]");
  if (!chip) {
    return;
  }

  setActiveRailLinks(chip.getAttribute("data-hover-rail"));
});

topologyModalBody.addEventListener("mouseout", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const chip = target.closest("[data-hover-rail]");
  if (!chip) {
    return;
  }

  setActiveRailLinks(null);
});

syncEraDerivedInputs();
render(calculateDesign(getInputs()));

function drawSpineTopologyLinks() {
  const charts = [...document.querySelectorAll("[data-spine-chart='true']")];

  charts.forEach((chart) => {
    const overlay = chart.querySelector(".spine-topology-overlay");
    if (!overlay) {
      return;
    }

    const chartRect = chart.getBoundingClientRect();
    const sources = [...chart.querySelectorAll("[data-link-source]")];

    overlay.setAttribute("viewBox", `0 0 ${chartRect.width} ${chartRect.height}`);
    overlay.setAttribute("width", `${chartRect.width}`);
    overlay.setAttribute("height", `${chartRect.height}`);

    const paths = [];

    sources.forEach((source) => {
      const linkId = source.getAttribute("data-link-source");
      const target = chart.querySelector(`[data-link-target="${linkId}"]`);
      if (!target) {
        return;
      }

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const directLink = source.getAttribute("data-link-direct") === "true";
      const x1 = sourceRect.left + sourceRect.width / 2 - chartRect.left;
      const x2 = targetRect.left + targetRect.width / 2 - chartRect.left;
      const y1 = directLink
        ? sourceRect.bottom - chartRect.top - 1
        : sourceRect.top - chartRect.top + 1;
      const y2 = directLink
        ? targetRect.bottom - chartRect.top - 1
        : targetRect.bottom - chartRect.top - 1;
      const color = source.getAttribute("data-link-color") || "#999";
      const railIndex = source.getAttribute("data-rail-index") || "";
      const midY = directLink
        ? Math.max(y1, y2) + 42
        : y1 - (y1 - y2) * 0.45;

      paths.push(`
        <path
          class="fabric-link-path"
          data-rail-index="${railIndex}"
          d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
          stroke-opacity="0"
          stroke-linecap="round"
        />
      `);
    });

    overlay.innerHTML = paths.join("");
  });
}

window.addEventListener("resize", () => {
  requestAnimationFrame(drawSpineTopologyLinks);
});
