"""Parse RGE command text without rounding numeric tokens or executing code.

These layouts are observations from BRM5RGE.xlsx, not a full game specification.
Unknown forms remain editable as raw text.
"""
import re
from decimal import Decimal, InvalidOperation


def field(key, label, kind="text", default="", optional=False, hint="", choices=None):
    return dict(key=key, label=label, kind=kind, default=default, optional=optional,
                hint=hint, choices=choices or [])


WORLD = field("world", "World number", "integer", "1", hint="World containing the target object.")
TARGET = field("target", "Object UID or %alias", default="%elevator")
POS = [field(axis, f"Position {axis.upper()}", "number", "0") for axis in ("x", "y", "z")]
ROT = [field("r" + axis, f"Rotation {axis.upper()}", "number", "0") for axis in ("x", "y", "z")]


def schema(name, prefix, fields, description, category):
    return dict(name=name, prefix=prefix, fields=fields, description=description, category=category)


SCHEMAS = {
    "move": schema("Move object", "move", [WORLD, TARGET, *POS, *ROT], "Place an object at a position and rotation.", "Objects"),
    "tween": schema("Tween object", "tween", [WORLD, TARGET, field("duration", "Duration (seconds)", "nonnegative", "4"), *POS, *ROT], "Animate an object to a destination.", "Objects"),
    "spawn": schema("Spawn object", "spawn", [WORLD, field("asset", "Asset name", default="Radar"), *POS, *ROT], "Create a named asset in a world.", "Objects"),
    "create": schema("Create part", "create", [WORLD, field("asset", "Part type", default="part"), *POS], "Create a part at a position.", "Objects"),
    "explosion": schema("Explosion", "explosion", [field("value1", "Power", "number", "10", hint="First argument; your convention."), field("value2", "Radius", "number", "150", hint="Second argument; your convention."), *POS, field("effect", "Explosion type", default="Motar", choices=["Motar", "C4", "Flash", "HelicopterVehicle"], hint="Exact spelling is preserved. You can enter another type.")], "Create an explosion using the workbook's argument order.", "Effects"),
    "teleport": schema("Teleport player", "teleport player", [field("player", "Player name", default="PlayerName"), *POS, field("heading", "Rotation (optional)", "number", "", True, "Final rotation parameter. Blank preserves the shorter workbook form.")], "Teleport a named player to coordinates.", "Players"),
    "bot": schema("Spawn bot", "bot spawn", [WORLD, field("asset", "Bot type", default="PL5_Rifleman", choices=["PL5_Rifleman", "POD_Rifleman"]), *POS, field("heading", "Orientation (degrees)", "number", "0", hint="Facing direction; identified in the BHRM Studio command parser.")], "Spawn a bot using the observed workbook layout.", "Players"),
    "trigger_add": schema("Add trigger", "trigger add", [WORLD, TARGET], "Attach a trigger to an object.", "Triggers"),
    "trigger_button": schema("Add trigger button", "trigger addbutton", [WORLD, TARGET], "Add a button to an object trigger.", "Triggers"),
    "trigger_delete": schema("Delete trigger group", "trigger delete", [WORLD, field("group", "Trigger group", default="mainentrenceL1")], "Delete the named trigger group.", "Triggers"),
    "trigger_set": schema("Set trigger", "trigger set", [WORLD, TARGET, field("event", "Trigger group", default="elevatorDownLeft"), field("enabled", "Trigger flag", "boolean", "true", hint="Preserves the final true/false value; its role is not yet confirmed.")], "Assign the trigger group and flag shown in the workbook.", "Triggers"),
    "trigger_whitelist": schema("Trigger whitelist", "trigger whitelist", [WORLD, field("scope", "Trigger group", default="lua"), field("property", "Property", default="IsLooping"), field("enabled", "Enabled", "boolean", "false")], "Edit a trigger group's whitelist or looping property.", "Triggers"),
    "wait": schema("Wait", "wait", [field("duration", "Duration (seconds)", "nonnegative", "1")], "Pause a command sequence.", "Sequence"),
    "raw": schema("Custom command", "", [field("raw", "Command text", default="", hint="Kept verbatim. Game syntax is not validated.")], "Preserve an unrecognized or advanced command.", "Custom"),
}


def generate(kind, values):
    if not isinstance(kind, str) or kind not in SCHEMAS:
        raise ValueError("Unknown command type.")
    if not isinstance(values, dict):
        raise ValueError("Fields must be an object.")
    if kind == "raw":
        raw = values.get("raw", "")
        if not isinstance(raw, str) or not raw.strip() or len(raw) > 10000:
            raise ValueError("Enter a command of 1–10,000 characters.")
        if "\n" in raw or "\r" in raw or "\x00" in raw:
            raise ValueError("Use one command per entry. Import text for multiple lines.")
        return raw
    tokens = [SCHEMAS[kind]["prefix"]]
    for item in SCHEMAS[kind]["fields"]:
        value = str(values.get(item["key"], "")).strip()
        if not value and item["optional"]:
            continue
        if not value or re.search(r"\s|\x00", value) or len(value) > 256:
            raise ValueError(f'{item["label"]}: enter one value without spaces.')
        if item["kind"] in ("number", "integer", "nonnegative"):
            if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", value):
                raise ValueError(f'{item["label"]}: enter a finite number.')
            try:
                number = Decimal(value)
            except InvalidOperation:
                raise ValueError(f'{item["label"]}: enter a finite number.') from None
            if not number.is_finite():
                raise ValueError(f'{item["label"]}: enter a finite number.')
            if item["kind"] == "integer" and (number != number.to_integral_value() or number < 1):
                raise ValueError(f'{item["label"]}: enter a positive whole number.')
            if item["kind"] == "nonnegative" and number < 0:
                raise ValueError(f'{item["label"]}: must be zero or greater.')
        if item["kind"] == "boolean" and value not in ("true", "false"):
            raise ValueError(f'{item["label"]}: choose true or false.')
        tokens.append(value)
    return " ".join(tokens)


def parse(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 10000:
        raise ValueError("Enter a command of 1–10,000 characters.")
    tokens = text.split()
    for kind, spec in sorted(SCHEMAS.items(), key=lambda pair: -len(pair[1]["prefix"])):
        if kind == "raw":
            continue
        prefix = spec["prefix"].split()
        if tokens[:len(prefix)] != prefix:
            continue
        args = tokens[len(prefix):]
        minimum = sum(not f["optional"] for f in spec["fields"])
        if not minimum <= len(args) <= len(spec["fields"]):
            break
        values = {f["key"]: args[i] if i < len(args) else "" for i, f in enumerate(spec["fields"])}
        try:
            code = generate(kind, values)
            return dict(kind=kind, values=values, code=code, warning=None)
        except ValueError:
            break
    return dict(kind="raw", values={"raw": text}, code=text,
                warning="Unrecognized or incomplete syntax. Preserved exactly; review in RGE.")
