from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import cable_routing

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(cable_routing.router, prefix="/api") 