from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

class Model(BaseModel):
    model_config = ConfigDict(extra='ignore', allow_inf_nan=False)

class Candidate(Model):
    id: str
    name: str
    party: str
    caucus: Optional[str] = None
    aliases: list[str] = []
    external_ids: dict[str,str] = {}

class Race(Model):
    id: str
    state: str
    state_name: str
    fips: str
    office: Literal['Senate','Governor']
    chamber: Optional[str] = None
    year: int = 2026
    election_type: Literal['regular','special']
    incumbent: Optional[str] = None
    incumbent_party: Optional[str] = None
    defending_party: str
    candidates: list[Candidate]
    status: str = 'scheduled'
    provider_ids: dict[str,str]
    sources: list[str]
    updated_at: str

class Poll(Model):
    id: str
    race_id: str
    provider: str
    underlying_id: str
    pollster: str
    sponsor: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    sample: Optional[int] = Field(default=None, ge=1)
    population: Optional[str] = None
    results: list[dict[str,Any]] = []
    figures: Optional[str] = None
    margin: Optional[float] = Field(default=None,ge=-100,le=100)
    adjusted_margin: Optional[float] = None
    url: Optional[str] = None
    methodology: dict[str,Any] = {}
    licence: str
    attribution: str

class PollingSummary(Model):
    race_id: str
    provider: str = 'polling_forecast'
    comparison_candidate_id: str
    poll_margin: Optional[float] = Field(default=None,ge=-100,le=100)
    forecast_margin: Optional[float] = Field(default=None,ge=-100,le=100)
    probability: Optional[float] = Field(default=None,ge=0,le=1)
    rating: Optional[str] = None
    polls_used: Optional[int] = None
    as_of: Optional[str] = None
    availability: str
    licence: str = 'CC BY 4.0'
    url: str

class MarketContract(Model):
    id: str
    provider: Literal['kalshi','polymarket']
    event_id: str
    market_id: str
    outcome_id: Optional[str] = None
    race_id: Optional[str] = None
    candidate_id: Optional[str] = None
    outcome: str
    outcome_type: Literal['party','candidate','control']
    question: str
    rules: str
    url: str
    status: str
    protocol: Optional[str] = None
    settlement: str
    comparison_group: Optional[str] = None

class MarketQuote(Model):
    contract_id: str
    provider: str
    race_id: Optional[str] = None
    candidate_id: Optional[str] = None
    outcome: str
    price: Optional[float] = Field(default=None,ge=0,le=1)
    bid: Optional[float] = Field(default=None,ge=0,le=1)
    ask: Optional[float] = Field(default=None,ge=0,le=1)
    midpoint: Optional[float] = Field(default=None,ge=0,le=1)
    last_trade: Optional[float] = Field(default=None,ge=0,le=1)
    volume: Optional[float] = None
    liquidity: Optional[float] = None
    source_timestamp: Optional[str] = None
    fetched_at: str
    pricing_method: str
    warning: Optional[str] = None

class ProviderStatus(Model):
    status: Literal['ok','partial','error','unavailable']
    last_attempt: str
    last_success: Optional[str] = None
    message: str = ''
    refresh_seconds: int

class Snapshot(Model):
    schema_version: int = 1
    generated_at: str
    providers: dict[str,ProviderStatus]
    races: list[Race]
    summaries: list[PollingSummary] = []
    polls: list[Poll] = []
    contracts: list[MarketContract] = []
    quotes: list[MarketQuote] = []
    context: dict[str,Any] = {}
