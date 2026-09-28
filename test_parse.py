from pydantic import BaseModel

from medgraph.nodes._utils import parse_llm_json


class T(BaseModel):
    next_question: str | None = None

raw1 = "<unused94>thought\nThinking...<unused94>\n```json\n{\n  \"next_question\": \"Hello?\"\n}\n```"
raw2 = "<unused94>thought\nThinking...{\n  \"next_question\": \"Hi?\"\n}"
raw3 = "<unused94>thought\nUnclosed thought block...{\n  \"next_question\": \"Hey?\"\n}"

print(parse_llm_json(raw1, T, "q"))
print(parse_llm_json(raw2, T, "q"))
print(parse_llm_json(raw3, T, "q"))

