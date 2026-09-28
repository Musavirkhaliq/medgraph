"""
Graph node implementations for the MedGraph clinical reasoning pipeline.

Each node is a pure function: ``(state: MedicalState) -> dict``
The returned dict is a *partial* state update — LangGraph merges it immutably.
"""
