import pytest

from app.gamification.points import experience_text


@pytest.mark.parametrize(
    ("amount", "expected"),
    [(1, "1 очко опыта"), (3, "3 очка опыта"), (5, "5 очков опыта"), (11, "11 очков опыта"),
     (21, "21 очко опыта"), (104, "104 очка опыта"), (112, "112 очков опыта"), (0, "0 очков опыта")],
)
def test_experience_declension(amount, expected):
    assert experience_text(amount) == expected
