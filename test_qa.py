import logging

from medgraph.nodes.questioner import questioner_node

logging.basicConfig(level=logging.INFO)

state = {
    "patient_input": "I have difficulty breathing",
    "question_round": 0,
    "qa_pairs": [],
    "triage_level": "urgent",
    "suspected_domains": ["respiratory"],
}

res = questioner_node(state)
print("RESULT:", res)
