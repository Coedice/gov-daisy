# Gov Daisy

An interactive circular/sunburst visualisation of the Australian federal budget, inspired by DaisyDisk.

## Features

- **Interactive Sunburst Chart**: Click segments to zoom in and explore spending categories
- **Detailed Tooltips**: Hover to see exact amounts and percentages
- **Year Comparison**: Switch between fiscal years to analyse trends
- **Search & Filter**: Find specific spending items across all categories
- **Budget vs Actual**: Compare planned budget with actual spending
- **Export Data**: Download data for research and analysis

## Running Locally

```sh
make build
```

Open your browser to `http://0.0.0.0:8080/`

## Data Structure

Government spending data is stored in `_data/expenditure/` as YAML files, with one file per fiscal year. Jekyll automatically parses these YAML files and makes them available to the visualisation.

## Technologies

- Jekyll for static site generation
- D3.js for data visualisation
- Pure CSS for styling

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
