import random

LABELS = ["stable", "shaky", "sharp_drift", "flat_drift", "off_pitch"]


def _features_from_cents(cents):
    average = sum(cents) / len(cents)
    absolute_average = abs(average)
    variance = sum((value - average) ** 2 for value in cents) / len(cents)
    std = variance ** 0.5
    steps = [abs(cents[index] - cents[index - 1]) for index in range(1, len(cents))]
    drift = cents[-1] - cents[0]
    slope = drift / max(1, len(cents) - 1)
    pitch_variance = std / 4
    duration = random.uniform(1.5, 5.5)
    return [
        average / 100,
        absolute_average / 100,
        std / 100,
        (sum(steps) / len(steps)) / 100,
        drift / 100,
        slope / 30,
        pitch_variance / 30,
        duration / 6,
    ]


def make_sample(label):
    length = random.randint(35, 95)

    if label == "stable":
        cents = [random.gauss(0, 5) for _ in range(length)]
    elif label == "shaky":
        cents = [
            random.gauss(0, 8) + 22 * ((-1) ** index) * random.random()
            for index in range(length)
        ]
    elif label == "sharp_drift":
        cents = [-8 + index * random.uniform(0.45, 0.9) + random.gauss(0, 5) for index in range(length)]
    elif label == "flat_drift":
        cents = [8 - index * random.uniform(0.45, 0.9) + random.gauss(0, 5) for index in range(length)]
    else:
        offset = random.choice([-1, 1]) * random.uniform(100, 220)
        cents = [offset + random.gauss(0, 12) for _ in range(length)]

    return _features_from_cents(cents), LABELS.index(label)


def build_dataset(size=3000, seed=42):
    random.seed(seed)
    features = []
    labels = []
    for _ in range(size):
        label = random.choice(LABELS)
        feature, target = make_sample(label)
        features.append(feature)
        labels.append(target)
    return features, labels
