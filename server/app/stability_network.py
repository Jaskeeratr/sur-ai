try:
    import torch.nn as nn
except ImportError:  # pragma: no cover - lets the app run without optional torch.
    nn = None


if nn is not None:

    class StabilityNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.network = nn.Sequential(
                nn.Linear(8, 32),
                nn.ReLU(),
                nn.Linear(32, 16),
                nn.ReLU(),
                nn.Linear(16, 5),
            )

        def forward(self, features):
            return self.network(features)

else:

    class StabilityNet:  # pragma: no cover
        def __init__(self, *args, **kwargs):
            raise ImportError("PyTorch is required to instantiate StabilityNet.")

