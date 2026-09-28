"""
Drug interaction checker tool.

A lightweight rule-based checker that flags well-known dangerous drug
combinations.  In production, this would call a clinical API such as
OpenFDA, DrugBank, or RxNorm.
"""

from __future__ import annotations

from langchain_core.tools import tool

# Known dangerous drug pairs (both directions)
_DANGEROUS_INTERACTIONS: list[tuple[str, str, str]] = [
    ("warfarin", "aspirin", "Major: Increased bleeding risk"),
    ("warfarin", "ibuprofen", "Major: Increased bleeding risk"),
    ("maoi", "ssri", "Contraindicated: Serotonin syndrome risk"),
    ("maoi", "tramadol", "Contraindicated: Serotonin syndrome risk"),
    ("simvastatin", "clarithromycin", "Major: Risk of myopathy/rhabdomyolysis"),
    ("metformin", "alcohol", "Moderate: Risk of lactic acidosis"),
    ("digoxin", "amiodarone", "Major: Increased digoxin toxicity"),
    ("clopidogrel", "omeprazole", "Moderate: Reduced antiplatelet effect"),
    ("lithium", "ibuprofen", "Major: Increased lithium toxicity"),
    ("methotrexate", "nsaid", "Major: Increased methotrexate toxicity"),
]


@tool
def check_drug_interactions(medications: list[str]) -> str:
    """
    Check a list of medication names for known dangerous interactions.

    Args:
        medications: List of medication name strings (generic names preferred).

    Returns:
        A text summary of any interactions found, or a clean bill of health.
    """
    meds_lower = [m.lower().strip() for m in medications]
    interactions_found = []

    for drug_a, drug_b, severity in _DANGEROUS_INTERACTIONS:
        a_present = any(drug_a in m for m in meds_lower)
        b_present = any(drug_b in m for m in meds_lower)
        if a_present and b_present:
            interactions_found.append(f"⚠️  {drug_a.title()} + {drug_b.title()}: {severity}")

    if not interactions_found:
        return "✅ No known major drug interactions detected among the listed medications."

    result = f"🚨 {len(interactions_found)} drug interaction(s) detected:\n"
    result += "\n".join(f"  {i}" for i in interactions_found)
    result += "\n\nReview with a clinical pharmacist before prescribing."
    return result
