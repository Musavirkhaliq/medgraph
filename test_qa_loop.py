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

for i in range(3):
    res = questioner_node(state)
    print(f"\n--- ROUND {i+1} ---")
    print(res)
    if res.get("question_complete"):
        print("STOPPED")
        break
    
    q = res["current_question"]
    state["qa_pairs"].append({"round_number": i+1, "question": q, "answer": "I don't know"})
    state["question_round"] = res["question_round"]

