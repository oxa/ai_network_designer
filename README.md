# AI Backend Network Designer

Small browser app for estimating and visualizing a multi-rail AI backend network fabric.

The current algorithmic mode is `ERA`.

## What it models

The app accepts:

- GPUs per node: `1`, `2`, `4`, `8`
- Total GPUs
- Rails per leaf: `1`, `2`, `4`, `8`
- NIC speed: `100`, `200`, `400`, `800`, `1600` Gbps
- Switch port speed: `100`, `200`, `400`, `800`, `1600` Gbps
- Ports per switch: `32`, `64`, `128`

`Total GPUs` must divide evenly by `GPUs per node`.

From those inputs it estimates:

- Total node count
- MaxClients
- NIC-to-switch ratio
- Available GPU downlinks per leaf
- Total leaf switches
- Leafs per GPU index
- Total spine switches
- Ports allocated per spine
- Superspine placeholder count
- Aggregate bandwidth

## ERA model assumptions

- The fabric is modeled as a two-tier Clos / leaf-spine design.
- Each GPU contributes exactly one NIC, so NICs per node equals GPUs per node.
- `Rails per leaf` is optional for now and is not used by the ERA computation.
- The fabric is non-blocking, so each leaf reserves half of its ports for downlinks and half for uplinks.
- `MaxClients = ports per switch / 2`
- `NICtoSwitchRatio = switch port speed / NIC speed` and must currently resolve to `1`, `2`, `4`, or `8`.
- `TotalAvailableDownlinks = MaxClients × NICtoSwitchRatio`
- `TotalLeaf = ceil(Total GPUs / TotalAvailableDownlinks)`
- `Leaf per GPU index = ceil(Total nodes / TotalAvailableDownlinks)`
- `TotalSpine = ceil((TotalAvailableDownlinks × TotalLeaf) / (TotalAvailableDownlinks × 2))`

## Run

Open [index.html](./index.html) in a browser.

There is no build step and no dependency install.

## Deploy on Vercel

This repository is configured to deploy as a static site on Vercel.

- No install command is required.
- No build command is required.
- The project root is the output.
- [`vercel.json`](./vercel.json) keeps filesystem routing first and falls back to `index.html`.

If you import the repo into Vercel, the default static deployment should work without additional setup.
