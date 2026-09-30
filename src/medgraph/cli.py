"""
MedGraph interactive CLI.

Provides a beautiful terminal-based interface for running the full medical
reasoning pipeline interactively.  Built with Rich for a premium terminal UX.

Usage:
    uv run python -m medgraph.cli
    uv run medgraph
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime

import typer
from rich import box
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.prompt import Confirm, Prompt
from rich.table import Table
from rich.text import Text

from medgraph.config import get_settings
from medgraph.graph import get_compiled_graph
from medgraph.prompts import MEDICAL_DISCLAIMER
from medgraph.state import initial_state

app = typer.Typer(
    name="medgraph",
    help="🩺 MedGraph — Multi-Agent Medical Reasoning System",
    add_completion=False,
)
console = Console()
logger = logging.getLogger(__name__)


# ── Rich helpers ──────────────────────────────────────────────────────────────

def _header() -> None:
    console.print(
        Panel(
            Text.from_markup(
                "[bold cyan]🩺  MedGraph[/bold cyan]  [dim]|  Multi-Agent Medical Reasoning System[/dim]\n"
                "[dim]Powered by LangGraph + MedGemma[/dim]"
            ),
            border_style="cyan",
            padding=(1, 4),
        )
    )
    console.print()


def _disclaimer() -> None:
    console.print(
        Panel(
            Markdown(f"**{MEDICAL_DISCLAIMER}**"),
            title="⚠️  Medical Disclaimer",
            border_style="yellow",
            padding=(0, 2),
        )
    )
    console.print()


def _print_phase(phase: str, icon: str = "▶") -> None:
    console.rule(f"[bold green]{icon}  {phase}[/bold green]")


def _print_report(state: dict) -> None:
    """Render the final clinical report as rich tables and panels."""
    console.print()
    console.rule("[bold white]📋  FINAL CLINICAL REPORT[/bold white]")
    console.print()

    # Triage summary
    triage_color = {
        "emergency": "red",
        "urgent": "yellow",
        "routine": "green",
    }.get(state.get("triage_level", "routine"), "white")

    console.print(
        Panel(
            f"[bold {triage_color}]Triage Level: {state.get('triage_level', 'N/A').upper()}[/bold {triage_color}]\n"
            f"Domains: {', '.join(state.get('suspected_domains', []))}\n"
            f"Reasoning: {state.get('triage_reasoning', 'N/A')}",
            title="🚦  Triage Assessment",
            border_style=triage_color,
        )
    )
    console.print()

    # Differential diagnosis table
    diff_dx = state.get("differential_diagnosis", [])
    if diff_dx:
        table = Table(title="🔬  Differential Diagnosis", box=box.ROUNDED, show_lines=True)
        table.add_column("Rank", style="dim", width=5)
        table.add_column("Condition", style="bold")
        table.add_column("Probability", justify="center")
        table.add_column("ICD Code", style="dim")
        table.add_column("Key Evidence")

        for i, dx in enumerate(diff_dx[:5], 1):
            prob = dx.get("probability", 0.0)
            prob_str = f"[green]{prob:.0%}[/green]" if prob > 0.6 else f"[yellow]{prob:.0%}[/yellow]"
            table.add_row(
                str(i),
                dx.get("condition", ""),
                prob_str,
                dx.get("icd_code") or "—",
                ", ".join(dx.get("evidence", [])[:3]),
            )
        console.print(table)
        console.print()

    primary = state.get("primary_diagnosis", "Not determined")
    confidence = state.get("diagnosis_confidence", 0.0)
    console.print(
        Panel(
            f"[bold green]{primary}[/bold green]\n"
            f"Confidence: [bold]{confidence:.0%}[/bold]",
            title="✅  Primary Diagnosis",
            border_style="green",
        )
    )
    console.print()

    # Medications
    meds = state.get("medications", [])
    if meds:
        med_table = Table(title="💊  Medications", box=box.SIMPLE_HEAD)
        med_table.add_column("Drug", style="bold")
        med_table.add_column("Dose & Route")
        med_table.add_column("Frequency")
        med_table.add_column("Duration")
        med_table.add_column("Indication", style="dim")

        for m in meds:
            med_table.add_row(
                m.get("name", ""),
                f"{m.get('dose', '')} {m.get('route', '')}".strip(),
                m.get("frequency", ""),
                m.get("duration", ""),
                m.get("indication", ""),
            )
        console.print(med_table)
        console.print()

    # Lifestyle & follow-up
    lifestyle = state.get("lifestyle_modifications", [])
    follow_up = state.get("follow_up", "")
    monitoring = state.get("monitoring", [])

    if lifestyle or follow_up or monitoring:
        info = ""
        if lifestyle:
            info += "**Lifestyle Modifications:**\n" + "\n".join(f"- {item}" for item in lifestyle) + "\n\n"
        if follow_up:
            info += f"**Follow-up:** {follow_up}\n\n"
        if monitoring:
            info += "**Monitoring:**\n" + "\n".join(f"- {m}" for m in monitoring)
        console.print(Panel(Markdown(info), title="🏃  Care Plan", border_style="blue"))
        console.print()

    # Validation
    is_safe = state.get("is_safe", False)
    warnings = state.get("validation_warnings", [])
    val_color = "green" if is_safe else "red"
    val_icon = "✅" if is_safe else "⚠️"
    val_text = f"{val_icon} {'SAFE' if is_safe else 'UNSAFE — review warnings'}"

    if warnings:
        warning_md = "\n".join(
            f"- **[{w.get('severity', '?').upper()}]** {w.get('message', '')}"
            for w in warnings
        )
        val_text += f"\n\n**Warnings:**\n{warning_md}"

    console.print(Panel(Markdown(val_text), title="🛡  Safety Validation", border_style=val_color))
    console.print()


async def _run_session(patient_input: str, session_id: str) -> None:
    """Run the full clinical reasoning graph interactively."""
    graph = get_compiled_graph()
    config = {"configurable": {"thread_id": session_id}}
    state = initial_state(session_id, patient_input)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        transient=True,
        console=console,
    ) as progress:
        # ── Initial run (intake + triage) ─────────────────────────────────────
        task = progress.add_task("[cyan]Running intake & triage …", total=None)
        await graph.ainvoke(state, config)
        progress.remove_task(task)

    # ── Interactive Q&A loop ──────────────────────────────────────────────────
    _print_phase("Adaptive Clinical Questioning", "❓")
    qa_count = 0

    while True:
        current_state = graph.get_state(config).values
        if current_state.get("is_emergency"):
            console.print(
                Panel(
                    "[bold red]🚨 EMERGENCY DETECTED[/bold red]\n"
                    f"{json.dumps(current_state.get('emergency_info', {}), indent=2)}",
                    border_style="red",
                )
            )
            return

        if current_state.get("question_complete"):
            break

        question = current_state.get("current_question")
        if not question:
            break

        qa_count += 1
        console.print(f"\n[bold cyan]Question {qa_count}:[/bold cyan] {question}")
        answer = Prompt.ask("[dim]Your answer[/dim]", default="skip")

        if answer.lower() == "skip":
            answer = "No additional information provided."

        # Inject answer and resume
        qa_entry = {
            "question": question,
            "answer": answer,
            "round_number": current_state.get("question_round", qa_count),
        }
        await graph.aupdate_state(config, {"qa_pairs": [qa_entry], "current_question": None})

        with Progress(SpinnerColumn(), TextColumn("[cyan]Processing …"), transient=True, console=console) as p:
            t = p.add_task("", total=None)
            await graph.ainvoke(None, config)
            p.remove_task(t)

    console.print("\n[green]✔[/green]  Q&A complete. Running full clinical pipeline …\n")

    # ── Image upload (optional) ───────────────────────────────────────────────
    _print_phase("Medical Images (Optional)", "🖼")
    console.print("[dim]Enter file paths to medical images, separated by commas.[/dim]")
    console.print("[dim]Press Enter to skip.[/dim]")
    image_input = Prompt.ask("[dim]Image paths[/dim]", default="")

    if image_input.strip():
        paths = [p.strip() for p in image_input.split(",") if p.strip()]
        await graph.aupdate_state(config, {"image_paths": paths})
        console.print(f"[green]✔[/green]  {len(paths)} image(s) added.")

    # ── Final pipeline run (case builder → validator) ─────────────────────────
    _print_phase("Completing Clinical Assessment", "⚕")
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
        console=console,
    ) as progress:
        for step_name in ["Building clinical case", "Recommending investigations",
                          "Generating diagnosis", "Creating treatment plan", "Validating safety"]:
            task = progress.add_task(f"[cyan]{step_name} …", total=None)
            await asyncio.sleep(0.1)  # let the spinner render
            progress.remove_task(task)

        # Wait for graph to finish
        await graph.ainvoke(None, config)

    # ── Test-results interrupt loop ────────────────────────────────────────────
    # investigator_node pauses the graph at "ask_for_test_results" whenever it
    # recommends any investigation or imaging (almost every real case). Resume
    # it the same way the API's /test_results endpoint does, or the pipeline
    # never reaches diagnosis/treatment.
    while graph.get_state(config).values.get("waiting_for_tests"):
        console.print(
            "[dim]The investigator requested test results before proceeding.[/dim]"
        )
        results_input = Prompt.ask(
            "[dim]Enter test result notes (or press Enter to skip)[/dim]", default=""
        )
        update: dict = {"waiting_for_tests": False}
        if results_input.strip():
            current_state = graph.get_state(config).values
            update["history"] = current_state.get("history", []) + [{
                "type": "test_results",
                "description": results_input.strip(),
                "status": "received",
                "since": "submitted with test results",
            }]
        await graph.aupdate_state(config, update)

        with Progress(SpinnerColumn(), TextColumn("[cyan]Resuming pipeline …"), transient=True, console=console) as p:
            t = p.add_task("", total=None)
            await graph.ainvoke(None, config)
            p.remove_task(t)

    # ── Render final report ───────────────────────────────────────────────────
    final_state = graph.get_state(config).values
    _print_report(final_state)

    # ── Save report ───────────────────────────────────────────────────────────
    settings = get_settings()
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = settings.reports_dir / f"report_{session_id}_{ts}.json"
    report_path.write_text(json.dumps(final_state, indent=2, default=str))

    console.print(
        Panel(
            f"Report saved to: [bold]{report_path}[/bold]",
            title="💾  Report Saved",
            border_style="dim",
        )
    )


# ── CLI commands ──────────────────────────────────────────────────────────────

@app.command()
def run(
    patient: str | None = typer.Option(None, "--patient", "-p", help="Patient description (skip prompt)"),
    session_id: str | None = typer.Option(None, "--session-id", "-s", help="Session ID"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable verbose logging"),
):
    """
    🩺  Run an interactive medical reasoning session.
    """
    if verbose:
        logging.basicConfig(level=logging.DEBUG)

    _header()
    _disclaimer()

    if not Confirm.ask("[dim]I understand this is for research purposes only. Continue?[/dim]", default=True):
        console.print("[yellow]Session cancelled.[/yellow]")
        raise typer.Exit()

    if patient is None:
        console.print("[bold]📝  Describe the patient's presentation:[/bold]")
        console.print(
            "[dim]Include: age, gender, symptoms, onset, severity, medical history, medications.[/dim]\n"
        )
        patient = Prompt.ask(
            "[cyan]Patient description[/cyan]",
            default=(
                "45-year-old male with sudden-onset sharp chest pain radiating to the left arm, "
                "shortness of breath for 2 hours. History of hypertension. Smokes 1 pack/day."
            ),
        )

    sid = session_id or f"cli_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    console.print(f"\n[dim]Session ID: {sid}[/dim]\n")

    asyncio.run(_run_session(patient, sid))


@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", help="API server host"),
    port: int = typer.Option(8000, help="API server port"),
    reload: bool = typer.Option(False, help="Enable hot reload"),
):
    """🌐  Start the MedGraph REST API server."""
    import uvicorn
    console.print(f"[bold cyan]Starting MedGraph API on {host}:{port} …[/bold cyan]")
    uvicorn.run("medgraph.api.app:app", host=host, port=port, reload=reload)


@app.command("ingest-guidelines")
def ingest_guidelines_command():
    """📚  Ingest the local guideline corpus (data/guidelines/*.md) for RAG retrieval."""
    from medgraph.services.guideline_store import ingest_guidelines

    console.print("[bold cyan]Ingesting guideline corpus …[/bold cyan]")
    count = asyncio.run(ingest_guidelines())
    console.print(f"[green]✔[/green]  Ingested {count} guideline chunk(s).")


if __name__ == "__main__":
    app()
