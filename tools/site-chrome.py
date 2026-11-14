#!/usr/bin/env python3
"""Совместимость: теперь всё в tools/build.py (шаблоны в templates/)."""
import pathlib, subprocess, sys
sys.exit(subprocess.call([sys.executable, str(pathlib.Path(__file__).with_name('build.py')), '--no-generate', '--no-check', '--only', 'chrome']))
