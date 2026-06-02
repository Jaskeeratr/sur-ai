from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    import torch
    import torch.nn as nn
except ImportError as error:
    raise SystemExit("Install optional ML dependencies first: python -m pip install -r requirements-ml.txt") from error

from app.stability_network import StabilityNet
from training.dataset import LABELS, build_dataset


def main():
    features, labels = build_dataset()
    x = torch.tensor(features, dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)

    model = StabilityNet()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    loss_fn = nn.CrossEntropyLoss()

    for epoch in range(160):
        optimizer.zero_grad()
        logits = model(x)
        loss = loss_fn(logits, y)
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        accuracy = (model(x).argmax(dim=1) == y).float().mean().item()

    model_dir = ROOT / "models"
    model_dir.mkdir(exist_ok=True)
    torch.save(
        {
            "model_state": model.state_dict(),
            "labels": LABELS,
            "training_accuracy": accuracy,
        },
        model_dir / "stability_model.pt",
    )
    print(f"saved {model_dir / 'stability_model.pt'} accuracy={accuracy:.3f}")


if __name__ == "__main__":
    main()
