import io
import os
import re

import openpyxl
import pandas as pd
import requests
import yaml

EXCEL_URL = "https://www.pbo.gov.au/sites/default/files/2025-04/PBO%20Historical%20fiscal%20data%20-%202025-26%20Budget%20update.xlsx"
SHEET_NAME = "Table 7"
START_DATA_ROW = 4  # 0-based index, row 5 in Excel

# Names to exclude from all budget processing
EXCLUDE_NAMES = {
    "Total expenses (including GST revenue provision)",
    "Total expenses (latest series)",
    "Total expenses",
    "ASL excluding military and reserves",
    "Military and reserves",
    "Total ASL",
}


def fetch_excel_bytes(url):
    """
    Download the Excel file from the given URL and return its bytes as a BytesIO object.
    """
    response = requests.get(url)
    response.raise_for_status()
    return io.BytesIO(response.content)


def build_budget_tree_from_excel(excel_bytes, years):
    """
    Parse the Excel sheet and build a hierarchical tree using indent levels.
    Loads the Excel workbook, finds the header row, identifies year columns, and
    builds a nested dictionary structure representing the budget hierarchy.
    """

    # Helper to determine if a node should be excluded
    def should_exclude(name, unit=None):
        if (
            name in EXCLUDE_NAMES
            or name.startswith("Total")
            or "(underlying basis)" in name
        ):
            return True
        if unit is not None and unit.strip().upper() == "ASL":
            return True
        return False

    # Load Excel workbook and worksheet
    wb = openpyxl.load_workbook(excel_bytes, data_only=True)
    ws = wb[SHEET_NAME]

    # Find the header row containing year labels
    year_pattern = re.compile(r"^\d{4}-\d{2,4}$")
    header_row_idx = None
    year_col_indices = []
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=20, values_only=True)):
        if len([1 for val in row if val and year_pattern.match(str(val).strip())]) > 3:
            header_row_idx = i
            break
    if header_row_idx is None:
        raise RuntimeError(
            "Could not find header row with year labels in first 20 rows"
        )
    headers = [cell.value for cell in ws[header_row_idx + 1]]

    # Identify which columns correspond to which years
    for idx, val in enumerate(headers):
        sval = str(val).strip() if val else ""
        if sval in years:
            year_col_indices.append(idx)

    # Build the hierarchical tree from the Excel rows
    data_start = header_row_idx + 1
    root = {"name": "Australian Government Budget", "children": []}
    stack = []
    for row in ws.iter_rows(min_row=data_start, values_only=False):
        cell = row[0]
        if cell.value is None or str(cell.value).strip().lower().startswith("nan"):
            continue
        name = str(cell.value).strip()
        unit_cell = row[1]
        unit = str(unit_cell.value).strip() if unit_cell and unit_cell.value else "$m"
        if should_exclude(name, unit):
            continue
        indent = (
            cell.alignment.indent if cell.alignment and cell.alignment.indent else 0
        )
        unit_multipliers = {
            "$t": 1_000_000_000_000,
            "$m": 1_000_000,
            "$b": 1_000_000_000,
            "$k": 1_000,
        }
        multiplier = unit_multipliers.get(unit, 1)
        budgets = {}
        for idx, y in zip(year_col_indices, years):
            val = row[idx].value if idx < len(row) else None
            if val is not None:
                try:
                    budgets[y] = float(val) * multiplier
                except Exception:
                    pass
        node = {"name": name, "unit": unit}
        if budgets:
            node["budget"] = budgets
        node["children"] = []
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if not stack:
            root["children"].append(node)
        else:
            stack[-1][1]["children"].append(node)
        stack.append((indent, node))
    return root, years


def export_yearly_yaml(tree, years, output_dir):
    """
    Export each year's budget data to a separate YAML file, filtering out unwanted nodes.
    Recursively filters the tree for each year and writes the result to a YAML file in the output directory.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Helper to determine if a node should be excluded
    def should_exclude(name, unit=None):
        """
        Return True if the node should be excluded from the output, based on name or unit.
        """
        if (
            name in EXCLUDE_NAMES
            or name.startswith("Total")
            or "(underlying basis)" in name
        ):
            return True
        if unit is not None and unit.strip().upper() == "ASL":
            return True
        return False

    def filter_for_year(node, year, unit=None):
        """
        Recursively filter the tree for a specific year, removing excluded nodes and keeping only relevant budget data.
        """
        if should_exclude(node["name"], node.get("unit", unit)):
            return None
        new_node = {"name": node["name"]}
        if "budget" in node and year in node["budget"]:
            new_node["budget"] = node["budget"][year]
        if node.get("children"):
            children = [
                filter_for_year(child, year, child.get("unit", unit))
                for child in node["children"]
            ]
            children = [
                c for c in children if c and ("budget" in c or c.get("children"))
            ]
            if children:
                new_node["children"] = children
        return new_node

    def add_siblings(node):
        """
        Add a _siblings key to each child node containing a list of its siblings.
        This is used for possible future processing or filtering that may require sibling context.
        """
        children = node.get("children", [])
        for i, child in enumerate(children):
            child["_siblings"] = [c for j, c in enumerate(children) if j != i]
            add_siblings(child)

    add_siblings(tree)

    # Export YAML for each year
    for year in years:
        out = filter_for_year(tree, year)
        out["name"] = f"Australian Government Budget {year}"
        yml_path = os.path.join(output_dir, f"year_{year}.yml")
        with open(yml_path, "w") as f:
            yaml.dump(out, f, sort_keys=False, allow_unicode=True)


if __name__ == "__main__":
    """
    Main entry point for the script. Downloads the Excel file, parses it, builds the budget tree,
    and exports yearly YAML files to the _data directory.
    """
    print("[INFO] Starting data generation...")

    # Download Excel file
    excel_bytes = fetch_excel_bytes(EXCEL_URL)

    # Read the Excel file with pandas to extract year labels
    raw = pd.read_excel(excel_bytes, sheet_name=SHEET_NAME, header=None)
    year_label_row = list(raw.iloc[2])
    years = []
    for val in year_label_row:
        sval = str(val).strip()
        if len(sval) == 7 and sval[:4].isdigit() and sval[4] == "-":
            years.append(sval)
        elif len(sval) == 4 and sval.isdigit():
            years.append(sval)
    years = sorted(set(years))

    # Build the budget tree from Excel
    tree, years = build_budget_tree_from_excel(excel_bytes, years)

    # Set output directory
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "_data"))

    # Export YAML files for each year
    export_yearly_yaml(tree, years, output_dir)

    print(f"[INFO] Data generation complete. YAML files written to {output_dir}")
