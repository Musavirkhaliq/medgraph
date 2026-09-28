"""
MedGraph: Multi-Agent Medical Reasoning System powered by LangGraph.

A production-grade clinical workflow engine implementing a 9-node reasoning graph:
Intake → Triage → Adaptive Q&A → Case Building → Investigations →
Image Interpretation → Diagnosis → Treatment → Safety Validation.
"""

__version__ = "0.1.0"
__author__ = "MedGraph Team"

from medgraph.graph import build_graph, get_compiled_graph

__all__ = ["build_graph", "get_compiled_graph", "__version__"]
