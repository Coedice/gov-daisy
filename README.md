# Gov Daisy

An interactive circular/sunburst visualisation of the Australian federal budgets and revenues, inspired by DaisyDisk.

## Features

- **Interactive Sunburst Chart**: Click segments to zoom in and explore spending categories
- **Detailed Tooltips**: Hover to see amounts and percentages
- **Year Comparison**: Switch between fiscal years to analyse trends
- **Search & Filter**: Find specific spending items across all categories
- **Budget and revenue**: Compare planned budget with actual spending

## Running Locally

```sh
make build
```

Open your browser to `http://0.0.0.0:8080/`

## Technologies

- Jekyll for static site generation
- D3.js for data visualisation
- SCSS for styling

## Data Source

The budget data is sourced from the Australian Parliamentary Budget Office: [Historical Fiscal Data](https://www.pbo.gov.au/publications-and-data/data-and-tools/data-portal/historical-fiscal-data)

## Automated Data Download & Conversion

Install uv (if not already):

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Run the script to fetch the latest CSV and convert it to YAML for Jekyll:

```sh
make update-data
```

Update the `data_url` in the script as needed for new budget years.
