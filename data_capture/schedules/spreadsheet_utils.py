import re

from django.core.exceptions import ValidationError


def safe_cell_str_value(sheet, rownum, colnum, coercer=None):
    val = ''

    try:
        val = sheet.cell_value(rownum, colnum)
    except IndexError:
        pass

    if coercer is not None:
        try:
            val = coercer(val)
        except ValueError:
            pass

    return str(val)


def generate_column_index_map(heading_row, field_title_map):
    def normalize(s):
        return re.sub(r'\s+', '', str(s).lower())

    def find_col(col_name):
        for idx, cell in enumerate(heading_row):
            if normalize(cell.value) == normalize(col_name):
                return idx
        raise ValidationError('Column heading "{}" was not found.'.format(
            col_name))

    col_idx_map = {}
    for field, title in field_title_map.items():
        col_idx_map[field] = find_col(title)

    return col_idx_map
